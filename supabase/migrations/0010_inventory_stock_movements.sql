-- Record snack stock movements on booking creation, and return the stock when a
-- booking ends without being served.
--
-- State before this migration: the trigger inventory_movements_apply was attached
-- to inventory_movements and worked correctly, but NOTHING ever inserted a movement
-- row. Verified on the live database: 6 SNACK booking_items and 0 movements, so
-- snacks.stock never moved and the admin inventory ledger was permanently empty.
--
-- Two parts:
--   1. create_booking() - re-applied from 0007 lines 74-225 with a SALE movement
--      inserted per snack line. The trigger then decrements stock, records
--      stock_after, and raises if the booking would oversell a snack.
--      NOTE: behaviour change - overselling a snack is now rejected at booking time
--      instead of silently producing a negative balance.
--   2. a bookings.status trigger that returns the stock on CANCELLED / EXPIRED /
--      NO_SHOW, so cancelled, expired and no-show bookings stop eating inventory.
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

    -- Stock movement. The BEFORE INSERT trigger on inventory_movements applies
    -- qty_delta to snacks.stock and fills stock_after; it also rejects oversell.
    -- Without this row the sale is never recorded and stock never moves.
    insert into inventory_movements (snack_id, movement_type, qty_delta, reason, booking_id, actor_id)
    values (v_snack.snack_id, 'SALE', -v_qty, 'booking ' || v_code, v_booking_id, p_created_by);

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
-- restore_snack_stock_on_end - return reserved stock when a booking ends unserved
-- ---------------------------------------------------------------------------
-- create_booking() records a SALE movement per snack line, but nothing ever put
-- it back. cancel_booking(), expire_bookings() and mark_no_show() all end a
-- booking without the customer receiving anything, so every abandoned or
-- cancelled booking silently consumed lounge inventory. Hooking the reversal to
-- the bookings.status transition covers all three paths plus any future one, and
-- the terminal statuses are one-way so each booking reverses exactly once.
create or replace function public.restore_snack_stock_on_end()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into inventory_movements (snack_id, movement_type, qty_delta, reason, booking_id, actor_id)
  select bi.snack_id,
         'IN',
         bi.quantity,
         'booking ' || new.booking_code || ' ' || new.status::text,
         new.booking_id,
         new.created_by
    from booking_items bi
   where bi.booking_id = new.booking_id
     and bi.item_type = 'SNACK'
     and bi.snack_id is not null;

  return new;
end;
$$;

drop trigger if exists bookings_restore_stock on public.bookings;
create trigger bookings_restore_stock
  after update of status on public.bookings
  for each row
  when (new.status in ('CANCELLED', 'EXPIRED', 'NO_SHOW')
        and old.status is distinct from new.status)
  execute function public.restore_snack_stock_on_end();
