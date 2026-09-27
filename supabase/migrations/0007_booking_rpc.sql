-- =============================================================================
-- 0007_booking_rpc.sql
-- Booking engine: atomic creation + guarded status transitions.
--
-- All functions are SECURITY DEFINER and EXECUTE is revoked from
-- anon/authenticated. The application calls them through the service layer
-- (service_role) so business rules cannot be bypassed from the browser.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- round a timestamp to the nearest booking interval
-- ---------------------------------------------------------------------------
create or replace function public.round_to_interval(
  p_at       timestamptz,
  p_interval integer
)
returns timestamptz
language sql
immutable
as $$
  select to_timestamp(
    round(extract(epoch from p_at) / (p_interval * 60)) * (p_interval * 60)
  );
$$;

-- ---------------------------------------------------------------------------
-- find_or_create_customer
-- WhatsApp number is the practical identifier, but never a password.
-- ---------------------------------------------------------------------------
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
  v_id text;
begin
  if p_phone is null or length(trim(p_phone)) < 6 then
    raise exception 'nomor WhatsApp tidak valid' using errcode = '22023';
  end if;

  select customer_id into v_id
    from customers
   where phone = trim(p_phone)
   order by created_at
   limit 1;

  if v_id is null then
    insert into customers (name, phone, email)
    values (trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email, '')), ''))
    returning customer_id into v_id;
  else
    update customers
       set name  = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
           email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email)
     where customer_id = v_id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_booking
-- One transaction: customer, booking, reservations (booking + cleaning),
-- line items. A slot clash raises from the GiST exclusion constraint and
-- rolls the whole thing back.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_branch_id        text,
  p_unit_id          text,
  p_customer_name    text,
  p_customer_phone   text,
  p_start_at         timestamptz default null,
  p_duration_minutes integer     default 60,
  p_customer_email   text        default null,
  p_game_id          text        default null,
  p_snacks           jsonb       default '[]'::jsonb,
  p_source           booking_source default 'ONLINE',
  p_created_by       uuid        default null,
  p_notes            text        default null
)
returns table (
  booking_id          text,
  booking_code        text,
  scheduled_start_at  timestamptz,
  scheduled_end_at    timestamptz,
  total_amount        integer,
  payment_deadline_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg         booking_config;
  v_unit        units;
  v_start       timestamptz;
  v_end         timestamptz;
  v_customer_id text;
  v_booking_id  text;
  v_code        text;
  v_rental      integer := 0;
  v_snack_total integer := 0;
  v_deadline    timestamptz;
  v_item        jsonb;
  v_snack       snacks;
  v_qty         integer;
begin
  -- --- config ---------------------------------------------------------------
  select * into v_cfg from get_booking_config(p_branch_id);
  if v_cfg.config_id is null then
    raise exception 'konfigurasi booking belum diatur' using errcode = '22023';
  end if;

  -- --- unit -----------------------------------------------------------------
  select * into v_unit from units where unit_id = p_unit_id;
  if v_unit.unit_id is null then
    raise exception 'unit % tidak ditemukan', p_unit_id using errcode = '22023';
  end if;
  if v_unit.branch_id <> p_branch_id then
    raise exception 'unit % bukan milik cabang %', p_unit_id, p_branch_id using errcode = '22023';
  end if;
  if v_unit.status in ('MAINTENANCE', 'OFFLINE') then
    raise exception 'unit % sedang tidak tersedia (%)', p_unit_id, v_unit.status using errcode = '22023';
  end if;

  -- --- time ------------------------------------------------------------------
  v_start := coalesce(p_start_at, round_to_interval(now(), v_cfg.booking_interval_minutes));
  v_start := round_to_interval(v_start, v_cfg.booking_interval_minutes);

  if v_start < now() - make_interval(mins => v_cfg.late_tolerance_minutes) then
    raise exception 'waktu mulai sudah terlewat' using errcode = '22023';
  end if;
  if v_start > now() + make_interval(days => v_cfg.advance_booking_days) then
    raise exception 'booking maksimal % hari ke depan', v_cfg.advance_booking_days using errcode = '22023';
  end if;
  if p_duration_minutes < v_cfg.minimum_duration_minutes
     or p_duration_minutes > v_cfg.maximum_duration_minutes then
    raise exception 'durasi harus antara % dan % menit',
      v_cfg.minimum_duration_minutes, v_cfg.maximum_duration_minutes using errcode = '22023';
  end if;
  if p_duration_minutes % v_cfg.booking_interval_minutes <> 0 then
    raise exception 'durasi harus kelipatan % menit', v_cfg.booking_interval_minutes using errcode = '22023';
  end if;
  v_end := v_start + make_interval(mins => p_duration_minutes);

  -- --- customer --------------------------------------------------------------
  v_customer_id := find_or_create_customer(p_customer_name, p_customer_phone, p_customer_email);

  -- --- price -----------------------------------------------------------------
  v_rental := calculate_price(p_branch_id, v_unit.facility_type_id, p_duration_minutes);
  if v_rental = 0 then
    raise exception 'harga untuk unit ini belum diatur' using errcode = '22023';
  end if;

  v_deadline := now() + make_interval(mins => v_cfg.payment_deadline_minutes);

  -- --- booking ---------------------------------------------------------------
  insert into bookings (
    branch_id, unit_id, customer_id, source, status,
    scheduled_start_at, scheduled_end_at, latest_extendable_at,
    duration_minutes, game_id, rental_amount,
    payment_deadline_at, notes, created_by
  )
  values (
    p_branch_id, p_unit_id, v_customer_id, p_source, 'WAITING_PAYMENT',
    v_start, v_end, v_end,
    p_duration_minutes, p_game_id, v_rental,
    v_deadline, p_notes, p_created_by
  )
  returning bookings.booking_id, bookings.booking_code
    into v_booking_id, v_code;

  -- --- reservations: the actual slot lock ------------------------------------
  insert into unit_reservations (unit_id, booking_id, kind, period)
  values
    (p_unit_id, v_booking_id, 'BOOKING',  tstzrange(v_start, v_end, '[)')),
    (p_unit_id, v_booking_id, 'CLEANING', tstzrange(v_end, v_end + make_interval(mins => v_cfg.cleaning_duration_minutes), '[)'));

  -- --- line items -------------------------------------------------------------
  insert into booking_items (booking_id, item_type, description, quantity, unit_price, subtotal)
  values (v_booking_id, 'RENTAL', v_unit.name || ' — ' || p_duration_minutes || ' menit', 1, v_rental, v_rental);

  for v_item in select * from jsonb_array_elements(coalesce(p_snacks, '[]'::jsonb)) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty <= 0 then
      raise exception 'jumlah snack harus lebih dari 0' using errcode = '22023';
    end if;

    select * into v_snack from snacks where snack_id = v_item ->> 'snack_id';
    if v_snack.snack_id is null then
      raise exception 'snack % tidak ditemukan', v_item ->> 'snack_id' using errcode = '22023';
    end if;
    if not v_snack.active then
      raise exception 'snack % sedang tidak tersedia', v_snack.name using errcode = '22023';
    end if;

    insert into booking_items (booking_id, item_type, snack_id, description, quantity, unit_price, subtotal)
    values (v_booking_id, 'SNACK', v_snack.snack_id, v_snack.name, v_qty, v_snack.price, v_qty * v_snack.price);

    v_snack_total := v_snack_total + (v_qty * v_snack.price);
  end loop;

  update bookings
     set snack_amount = v_snack_total,
         total_amount = v_rental + v_snack_total - discount_amount
   where bookings.booking_id = v_booking_id;

  -- --- unit status ------------------------------------------------------------
  if v_unit.status = 'AVAILABLE' then
    update units set status = 'BOOKED' where unit_id = p_unit_id;
    insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id, actor_id)
    values (p_unit_id, 'AVAILABLE', 'BOOKED', 'booking ' || v_code, v_booking_id, p_created_by);
  end if;

  return query
    select v_booking_id, v_code, v_start, v_end, v_rental + v_snack_total, v_deadline;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_booking — payment settled
-- ---------------------------------------------------------------------------
create or replace function public.confirm_booking(p_booking_id text)
returns booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status booking_status;
begin
  select status into v_status from bookings where booking_id = p_booking_id for update;
  if v_status is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_status <> 'WAITING_PAYMENT' then
    raise exception 'booking % tidak bisa dikonfirmasi dari status %', p_booking_id, v_status using errcode = '22023';
  end if;

  update bookings
     set status = 'CONFIRMED', payment_deadline_at = null
   where booking_id = p_booking_id;

  return 'CONFIRMED';
end;
$$;

-- ---------------------------------------------------------------------------
-- check_in — customer arrives
-- ---------------------------------------------------------------------------
create or replace function public.check_in(p_booking_id text)
returns booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status <> 'CONFIRMED' then
    raise exception 'booking % tidak bisa check-in dari status %', p_booking_id, v_booking.status using errcode = '22023';
  end if;

  update bookings
     set status = 'IN_USE', actual_start_at = now()
   where booking_id = p_booking_id;

  update units set status = 'IN_USE' where unit_id = v_booking.unit_id;
  insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
  values (v_booking.unit_id, 'BOOKED', 'IN_USE', 'check-in', p_booking_id);

  return 'IN_USE';
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_booking — session over, unit goes to cleaning
-- ---------------------------------------------------------------------------
create or replace function public.complete_booking(p_booking_id text)
returns booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status <> 'IN_USE' then
    raise exception 'booking % tidak bisa diselesaikan dari status %', p_booking_id, v_booking.status using errcode = '22023';
  end if;

  update bookings
     set status = 'COMPLETED',
         actual_end_at = now()
   where booking_id = p_booking_id;

  update units set status = 'IN_ORDER', condition = 'NEEDS_CLEANING' where unit_id = v_booking.unit_id;
  insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
  values (v_booking.unit_id, 'IN_USE', 'IN_ORDER', 'check-out', p_booking_id);

  update customers
     set total_booking = total_booking + 1,
         total_spending = total_spending + v_booking.total_amount,
         last_booking_at = now(),
         first_booking_at = coalesce(first_booking_at, now())
   where customer_id = v_booking.customer_id;

  return 'COMPLETED';
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_unit_ready — cleaning done
-- ---------------------------------------------------------------------------
create or replace function public.mark_unit_ready(p_unit_id text)
returns unit_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from unit_status;
begin
  select status into v_from from units where unit_id = p_unit_id for update;
  if v_from is null then
    raise exception 'unit % tidak ditemukan', p_unit_id using errcode = '22023';
  end if;
  if v_from not in ('IN_ORDER', 'MAINTENANCE') then
    raise exception 'unit % tidak bisa ditandai siap dari status %', p_unit_id, v_from using errcode = '22023';
  end if;

  update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = p_unit_id;
  insert into unit_status_history (unit_id, from_status, to_status, reason)
  values (p_unit_id, v_from, 'AVAILABLE', 'unit siap');

  return 'AVAILABLE';
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking — releases the slot
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking_id text, p_reason text default null)
returns booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status not in ('DRAFT', 'WAITING_PAYMENT', 'CONFIRMED') then
    raise exception 'booking % tidak bisa dibatalkan dari status %', p_booking_id, v_booking.status using errcode = '22023';
  end if;

  update bookings
     set status = 'CANCELLED', cancelled_reason = p_reason
   where booking_id = p_booking_id;

  delete from unit_reservations where booking_id = p_booking_id;

  if v_booking.status = 'CONFIRMED' then
    update units set status = 'AVAILABLE' where unit_id = v_booking.unit_id and status = 'BOOKED';
    insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
    values (v_booking.unit_id, 'BOOKED', 'AVAILABLE', 'booking dibatalkan', p_booking_id);
  end if;

  return 'CANCELLED';
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_no_show — customer never arrived
-- ---------------------------------------------------------------------------
create or replace function public.mark_no_show(p_booking_id text)
returns booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status <> 'CONFIRMED' then
    raise exception 'booking % tidak bisa ditandai no-show dari status %', p_booking_id, v_booking.status using errcode = '22023';
  end if;

  update bookings set status = 'NO_SHOW' where booking_id = p_booking_id;
  delete from unit_reservations where booking_id = p_booking_id;

  update units set status = 'AVAILABLE' where unit_id = v_booking.unit_id and status = 'BOOKED';
  insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
  values (v_booking.unit_id, 'BOOKED', 'AVAILABLE', 'no-show', p_booking_id);

  return 'NO_SHOW';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service layer only
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'round_to_interval(timestamptz, integer)',
    'find_or_create_customer(text, text, text)',
    'create_booking(text, text, text, text, timestamptz, integer, text, text, jsonb, booking_source, uuid, text)',
    'confirm_booking(text)',
    'check_in(text)',
    'complete_booking(text)',
    'mark_unit_ready(text)',
    'cancel_booking(text, text)',
    'mark_no_show(text)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;