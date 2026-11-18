-- =============================================================================
-- 0040_rate_limits.sql
--
-- Rate limiter in-memory tidak efektif di Vercel (satu Map per instance
-- serverless). Counter dipindah ke Postgres agar konsisten lintas instance.
-- Lockout per kode booking untuk brute-force last-4 (5 salah → kunci 15 menit).
-- =============================================================================

create table if not exists public.rate_limit_counters (
  key text primary key,
  count integer not null default 0,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.rate_limit_counters enable row level security;
-- Tidak ada policy anon/authenticated: hanya via RPC security definer.

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_expires timestamptz;
  v_retry integer;
begin
  insert into public.rate_limit_counters (key, count, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case when public.rate_limit_counters.expires_at <= now()
                       then 1 else public.rate_limit_counters.count + 1 end,
        expires_at = case when public.rate_limit_counters.expires_at <= now()
                          then now() + make_interval(secs => p_window_seconds)
                          else public.rate_limit_counters.expires_at end,
        updated_at = now()
  returning public.rate_limit_counters.count, public.rate_limit_counters.expires_at
    into v_count, v_expires;

  -- PENTING: `return query` hanya menambah baris ke hasil; fungsi TIDAK berhenti.
  -- Tanpa `return;` di bawahnya, cabang "dilewati" ikut menambah baris kedua
  -- (false lalu true) dan pemanggil membaca allow yang salah.
  if v_count > p_limit then
    v_retry := greatest(1, ceil(extract(epoch from (v_expires - now())))::integer);
    return query select false, v_retry;
    return;
  end if;

  return query select true, 0;
  return;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from anon, authenticated, public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Lockout gagal verifikasi last-4 per kode booking.
create table if not exists public.booking_access_failures (
  booking_code text primary key,
  fails integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.booking_access_failures enable row level security;

create or replace function public.booking_access_record(p_booking_code text, p_success boolean)
returns table (locked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fails integer;
  v_locked_until timestamptz;
  v_retry integer;
begin
  select fails, locked_until into v_fails, v_locked_until
    from public.booking_access_failures where booking_code = p_booking_code;

  -- `return query` tidak menghentikan fungsi — `return;` wajib di setiap
  -- cabang, kalau tidak baris kedua ikut ditambahkan ke hasil.
  if v_locked_until is not null and v_locked_until > now() then
    v_retry := greatest(1, ceil(extract(epoch from (v_locked_until - now())))::integer);
    return query select true, v_retry;
    return;
  end if;

  if p_success then
    delete from public.booking_access_failures where booking_code = p_booking_code;
    return query select false, 0;
    return;
  end if;

  v_fails := coalesce(v_fails, 0) + 1;
  if v_fails >= 5 then
    v_locked_until := now() + interval '15 minutes';
  else
    v_locked_until := null;
  end if;

  insert into public.booking_access_failures (booking_code, fails, locked_until, updated_at)
  values (p_booking_code, v_fails, v_locked_until, now())
  on conflict (booking_code) do update
    set fails = excluded.fails, locked_until = excluded.locked_until, updated_at = now();

  if v_locked_until is not null then
    return query select true, 900;
    return;
  end if;
  return query select false, 0;
  return;
end;
$$;

revoke execute on function public.booking_access_record(text, boolean) from anon, authenticated, public;
grant execute on function public.booking_access_record(text, boolean) to service_role;

create or replace function public.booking_access_is_locked(p_booking_code text)
returns table (locked boolean, retry_after_seconds integer)
language sql
security definer
set search_path = public
as $$
  select
    (locked_until is not null and locked_until > now()),
    coalesce(greatest(1, ceil(extract(epoch from (locked_until - now())))::integer), 0)
  from public.booking_access_failures
  where booking_code = p_booking_code
  union all
  select false, 0
  where not exists (select 1 from public.booking_access_failures where booking_code = p_booking_code)
  limit 1;
$$;

revoke execute on function public.booking_access_is_locked(text) from anon, authenticated, public;
grant execute on function public.booking_access_is_locked(text) to service_role;

-- Vote & request: tidak lagi boleh insert langsung dari anon.
drop policy if exists "public create game_requests" on public.game_requests;
drop policy if exists "public create game_votes" on public.game_votes;

alter table public.game_requests
  drop constraint if exists game_requests_name_len;
alter table public.game_requests
  add constraint game_requests_name_len check (char_length(game_name) <= 80);
