-- =============================================================================
-- 0030_walkin_start_now.sql
--
-- A walk-in without an explicit start time was rejected for 50 minutes of every hour.
--
-- create_booking() did:
--     v_start := coalesce(p_start_at, round_to_interval(now(), interval));
--     v_start := round_to_interval(v_start, interval);
-- With a 60-minute interval and a 10-minute late tolerance, "now" floored to the top
-- of the hour is up to 60 minutes in the past, so the guard
--     v_start < now() - late_tolerance_minutes
-- raised 'waktu mulai sudah terlewat' for every start between HH:10 and HH:59. The
-- cashier form leaves the time empty to mean "sekarang", so most walk-ins simply could
-- not be created -- and with a promo selected the cashier hits the same wall.
--
-- Fix: an explicit start is still snapped to the grid (that is what the slot grid and
-- the availability checks assume); "start now" is taken literally. The tolerance is
-- still what lets a customer book a slot that began up to 10 minutes ago.
--
-- The function body below is copied verbatim from 0029 apart from that one block, so
-- the promo rules it also carries are not rewritten here. The previous signature is
-- dropped first: adding an argument creates an overload rather than replacing one, and
-- two create_booking functions would leave PostgREST choosing between them.
-- =============================================================================

drop function if exists public.create_booking(
  text, text, text, text, timestamptz, integer, text, text, jsonb, booking_source, uuid, text, text
);
create or replace function public.create_booking(
  p_branch_id        text,
  p_unit_id          text,
  p_customer_name    text,
  p_customer_phone   text,
  p_start_at         timestamptz default null,
  p_duration_minutes integer default 60,
  p_customer_email   text default null,
  p_game_id          text default null,
  p_snacks           jsonb default '[]'::jsonb,
  p_source           booking_source default 'ONLINE'::booking_source,
  p_created_by       uuid default null,
  p_notes            text default null,
  p_promotion_id     text default null
)
returns table(booking_id text, booking_code text, scheduled_start_at timestamptz, scheduled_end_at timestamptz, total_amount integer, payment_deadline_at timestamptz)
language plpgsql
security definer
set search_path = 'public', 'extensions'
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
  v_promo_name  text;
  v_promo_price integer;
  v_discount    integer := 0;
  v_bonus_qty   integer := 0;
  v_promo_bonus_id text;
  v_bonus       snacks;
  v_bonus_note  text;
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
  if p_start_at is null then
    -- Walk-in: the customer is standing at the counter, so the session begins now. Do
    -- not floor this to the interval -- with a 60-minute interval and a 10-minute late
    -- tolerance, the floored time is already past and the guard below rejects it.
    v_start := now();
  else
    v_start := round_to_interval(p_start_at, v_cfg.booking_interval_minutes);
  end if;

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

  -- --- promo ------------------------------------------------------------------
  -- Every rule is re-checked here rather than trusted from the client: the form shows
  -- what a promo would cost, but the price that gets written is decided in here.
  if p_promotion_id is not null and btrim(p_promotion_id) <> '' then
    select p.name into v_promo_name
      from promotions p
     where p.promotion_id = p_promotion_id
       and p.branch_id = p_branch_id
       and p.status = 'ACTIVE';
    if v_promo_name is null then
      raise exception 'promo % tidak aktif di cabang %', p_promotion_id, p_branch_id using errcode = '22023';
    end if;

    select i.price into v_promo_price
      from promotion_items i
     where i.promotion_id = p_promotion_id
       and i.facility_type_id = v_unit.facility_type_id
       and i.duration_minutes = p_duration_minutes;
    if v_promo_price is null then
      raise exception 'promo % tidak berlaku untuk tipe unit ini atau durasi % menit',
        p_promotion_id, p_duration_minutes using errcode = '22023';
    end if;

    -- A "promo" that costs the same or more is a pricing mistake, and letting it
    -- through would book at a higher price than the customer was quoted.
    if v_promo_price >= v_rental then
      raise exception 'harga promo % (%) tidak lebih murah dari harga normal (%)',
        p_promotion_id, v_promo_price, v_rental using errcode = '22023';
    end if;

    v_discount := v_rental - v_promo_price;

    -- R7: the perk travels with the package. Availability is decided here, not in the
    -- form — the form only promises "selama stok".
    select coalesce(i.bonus_quantity, 0), i.bonus_snack_id
      into v_bonus_qty, v_promo_bonus_id
      from promotion_items i
     where i.promotion_id = p_promotion_id
       and i.facility_type_id = v_unit.facility_type_id
       and i.duration_minutes = p_duration_minutes;

    if v_bonus_qty > 0 then
      select * into v_bonus from snacks where snack_id = v_promo_bonus_id;
      if v_bonus.snack_id is null or not v_bonus.active
         or v_bonus.stock < v_bonus.min_stock + v_bonus_qty then
        -- A gift we cannot give must not cost the customer the discount.
        v_bonus_note := 'promo: bonus ' || coalesce(v_bonus.name, v_promo_bonus_id) || ' sedang kosong';
        v_bonus_qty := 0;
      end if;
    end if;
  end if;

  v_deadline := now() + make_interval(mins => v_cfg.payment_deadline_minutes);

  -- --- booking ---------------------------------------------------------------
  insert into bookings (
    branch_id, unit_id, customer_id, source, status,
    scheduled_start_at, scheduled_end_at, latest_extendable_at,
    duration_minutes, game_id, rental_amount, discount_amount, promotion_id,
    payment_deadline_at, notes, created_by
  )
  values (
    p_branch_id, p_unit_id, v_customer_id, p_source, 'WAITING_PAYMENT',
    v_start, v_end, v_end,
    p_duration_minutes, p_game_id, v_rental, v_discount, p_promotion_id,
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
  -- The rental line keeps the normal price: discount_amount already carries the promo,
  -- and a receipt that says "sewa 110.000, diskon 50.000" is the honest way to show it.
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

  -- --- promo bonus line -------------------------------------------------------
  -- Free line, but a real stock movement: the snack left the shelf. The reversal trigger
  -- keys on movement_type SALE, so cancelling the booking puts the bonus back too.
  if v_bonus_qty > 0 then
    insert into booking_items (booking_id, item_type, snack_id, description, quantity, unit_price, subtotal)
    values (v_booking_id, 'SNACK', v_bonus.snack_id,
            v_bonus.name || ' (bonus promo)', v_bonus_qty, 0, 0);

    insert into inventory_movements (snack_id, movement_type, qty_delta, reason, booking_id, actor_id)
    values (v_bonus.snack_id, 'SALE', -v_bonus_qty, 'bonus promo ' || p_promotion_id, v_booking_id, p_created_by);
  end if;

  update bookings
     set snack_amount = v_snack_total,
         total_amount = v_rental + v_snack_total - v_discount,
         -- Staff see the shortfall on the ticket instead of the customer discovering
         -- at the counter that the gift was out of stock.
         notes = case
                   when v_bonus_note is null then notes
                   when notes is null or notes = '' then v_bonus_note
                   else notes || E'\n' || v_bonus_note
                 end
   where bookings.booking_id = v_booking_id;

  -- --- unit status ------------------------------------------------------------
  if v_unit.status = 'AVAILABLE' then
    update units set status = 'BOOKED' where unit_id = p_unit_id;
    insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id, actor_id)
    values (p_unit_id, 'AVAILABLE', 'BOOKED', 'booking ' || v_code, v_booking_id, p_created_by);
  end if;

  return query
    select v_booking_id, v_code, v_start, v_end, v_rental + v_snack_total - v_discount, v_deadline;
end;
$$;
