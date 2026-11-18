-- =============================================================================
-- 0041_phone_normalization.sql
--
-- Nomor telepon dinormalisasi ke format 62… sebelum disimpan/dicocokkan.
-- Backfill dulu, CHECK belakangan (migrasi akan gagal bila data lama kotor).
-- =============================================================================

-- helper: normalisasi nomor HP di Postgres
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(p_phone, '[^0-9]', '', 'g') like '62%' then regexp_replace(p_phone, '[^0-9]', '', 'g')
    when regexp_replace(p_phone, '[^0-9]', '', 'g') like '0%' then '62' || substring(regexp_replace(p_phone, '[^0-9]', '', 'g') from 2)
    when regexp_replace(p_phone, '[^0-9]', '', 'g') like '8%' then '62' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    else regexp_replace(p_phone, '[^0-9]', '', 'g')
  end;
$$;

-- Backfill pelanggan lama yang masih format 08…
update public.customers
   set phone = public.normalize_phone(phone)
 where phone !~ '^62[0-9]{8,13}$';

-- Setelah backfill, pasang CHECK.
alter table public.customers
  drop constraint if exists customers_phone_normalized;
alter table public.customers
  add constraint customers_phone_normalized check (phone ~ '^62[0-9]{8,13}$');

-- find_or_create_customer: normalisasi sebelum match; nama hanya diisi bila
-- kosong (jangan timpa diam-diam) + catat perubahan di audit_logs.
create or replace function public.find_or_create_customer(
  p_name  text,
  p_phone text,
  p_email text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(coalesce(trim(p_phone), ''));
  v_id text;
  v_old_name text;
begin
  if v_phone is null or v_phone !~ '^62[0-9]{8,13}$' then
    raise exception 'nomor WhatsApp tidak valid' using errcode = '22023';
  end if;

  select customer_id into v_id
    from customers
   where phone = v_phone
   order by created_at
   limit 1;

  if v_id is null then
    insert into customers (name, phone, email)
    values (trim(p_name), v_phone, nullif(trim(coalesce(p_email, '')), ''))
    returning customer_id into v_id;
  else
    select name into v_old_name from customers where customer_id = v_id;
    -- Nama: isi hanya bila kosong; bila ada nama baru yang berbeda, catat
    -- di audit_logs tapi jangan timpa diam-diam bila nama lama sudah ada.
    if v_old_name is null or btrim(v_old_name) = '' then
      update customers
         set name = trim(p_name),
             email = coalesce(email, nullif(trim(coalesce(p_email, '')), ''))
       where customer_id = v_id;
    elsif btrim(p_name) <> '' and btrim(p_name) <> v_old_name then
      insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_data, after_data, reason)
      values (null, null, 'customer_name_change_requested', 'customers', v_id,
              jsonb_build_object('name', v_old_name),
              jsonb_build_object('name', trim(p_name)),
              'perubahan nama tidak diterapkan otomatis; perlu verifikasi admin');
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.normalize_phone(text) from anon, authenticated, public;
grant execute on function public.normalize_phone(text) to service_role;
revoke execute on function public.find_or_create_customer(text, text, text) from anon, authenticated, public;
grant execute on function public.find_or_create_customer(text, text, text) to service_role;
