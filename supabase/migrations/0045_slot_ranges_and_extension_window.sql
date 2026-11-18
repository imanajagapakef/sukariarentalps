-- =============================================================================
-- 0045_slot_ranges_and_extension_window.sql
--
-- Dua hal yang dilaporkan pemilik saat memakai /booking dan /extension:
--
-- 1) Pemilih jam hanya bilang "Dipesan · selesai 20.00" di setiap kotak, tanpa
--    memberi tahu JAM BERAPA blok itu mulai, dan tanpa membedakan blok booking
--    dari jendela pembersihan. Akibatnya orang harus menebak: "18.00–20.00 sudah
--    dipesan, berarti 20.00 bisa?" (padahal 20.00–20.30 dibersihkan). Fungsi ini
--    sekarang ikut mengembalikan rentang blok yang menempati slot:
--      busy_from, busy_until, busy_kind ('BOOKING' | 'CLEANING').
--    Nilainya hanya diisi untuk state yang benar-benar terpakai (BOOKED,
--    IN_USE, CLEANING) supaya slot lampau/kosong tidak membawa noise.
--
--    Sekalian: state IN_USE dulu praktis tidak pernah muncul karena cabang
--    pertama menandai semua slot yang mulai di masa lalu sebagai PAST. Sesi yang
--    SEDANG berjalan (mulai 19.00, sekarang 19.30) tampil "Lewat", bukan "Sedang
--    main". Urutan penilaian diperbaiki tanpa mengubah arti PAST untuk blok yang
--    sudah benar-benar selesai.
--
-- 2) latest_extendable() mengembalikan scheduled_end_at ketika TIDAK ADA
--    reservasi berikutnya. Halaman /extension membacanya sebagai "ruang = 0",
--    jadi booking terakhir hari itu — justru yang paling bebas diperpanjang —
--    selalu dibilang "Belum ada ruang untuk tambahan 1 jam penuh". Sekarang
--    fungsi mengembalikan NULL bila tidak ada yang menghalangi, dan waktu mulai
--    reservasi berikutnya bila ada.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) slot_availability + rentang blok
-- ---------------------------------------------------------------------------
-- Return type berubah, jadi fungsi harus di-drop (Postgres menolak
-- `create or replace` yang mengubah daftar kolom hasil). Grant di 0042 ikut
-- hilang bersama fungsinya, jadi diberikan ulang di bawah.
drop function if exists public.slot_availability(text, text, date, integer);

create function public.slot_availability(
  p_branch_id        text,
  p_unit_id          text,
  p_date             date,
  p_duration_minutes integer default 60
)
returns table (
  slot_start timestamptz,
  slot_end   timestamptz,
  state      text,
  ready_at   timestamptz,
  busy_from  timestamptz,
  busy_until timestamptz,
  busy_kind  text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_cfg      booking_config;
  v_interval integer;
  v_minutes  integer;
  v_max      integer;
  v_status   unit_status;
  v_now      timestamptz := now();
  v_open     timestamptz;
begin
  select * into v_cfg from get_booking_config(p_branch_id);
  v_interval := coalesce(v_cfg.booking_interval_minutes, 30);
  v_minutes  := coalesce(p_duration_minutes, 60);
  v_max      := coalesce(v_cfg.maximum_duration_minutes, 360);

  if v_minutes < coalesce(v_cfg.minimum_duration_minutes, 60) or v_minutes > v_max then
    raise exception 'durasi harus antara % dan % menit',
      coalesce(v_cfg.minimum_duration_minutes, 60), v_max using errcode = '22023';
  end if;
  if v_minutes % v_interval <> 0 then
    raise exception 'durasi harus kelipatan % menit', v_interval using errcode = '22023';
  end if;

  select u.status into v_status from units u where u.unit_id = p_unit_id;
  if v_status is null then
    raise exception 'unit % tidak ditemukan', p_unit_id using errcode = '22023';
  end if;

  -- Operate on the requested day in the lounge's own timezone.
  v_open := (p_date::timestamp) at time zone 'Asia/Jakarta';

  return query
  with slots as (
    select v_open + make_interval(mins => m) as s
      from generate_series(0, (1440 / v_interval) * v_interval - v_interval, v_interval) as m
  ),
  windows as (
    select sl.s as slot_start,
           sl.s + make_interval(mins => v_minutes) as slot_end
      from slots sl
  ),
  /* Satu baris per slot yang bersinggungan dengan reservasi BOOKING, membawa
     batas blok itu: min(lower) = mulai dipesan, max(upper) = selesai dipesan. */
  booking_windows as (
    select w.slot_start,
           min(lower(r.period)) as from_at,
           max(upper(r.period)) as until_at
      from windows w
      join unit_reservations r
        on r.unit_id = p_unit_id
       and r.kind = 'BOOKING'
       and r.period && tstzrange(w.slot_start, w.slot_end, '[)')
     group by w.slot_start
  ),
  cleaning_windows as (
    select w.slot_start,
           min(lower(r.period)) as from_at,
           max(upper(r.period)) as until_at
      from windows w
      join unit_reservations r
        on r.unit_id = p_unit_id
       and r.kind = 'CLEANING'
       and r.period && tstzrange(w.slot_start, w.slot_end, '[)')
     group by w.slot_start
  ),
  judged as (
    select w.slot_start,
           w.slot_end,
           b.from_at as booked_from,
           b.until_at as booked_until,
           c.from_at as cleaning_from,
           c.until_at as cleaning_until
      from windows w
      left join booking_windows  b on b.slot_start = w.slot_start
      left join cleaning_windows c on c.slot_start = w.slot_start
  ),
  stated as (
    select j.*,
           case
             when v_status in ('MAINTENANCE', 'OFFLINE') then 'OUT_OF_SERVICE'
             -- Sesi yang sedang berjalan menang atas PAST: itulah informasi
             -- yang dicari orang ("unit ini lagi dipakai sampai jam berapa").
             when j.booked_from is not null
                  and j.booked_from <= v_now and v_now < j.booked_until then 'IN_USE'
             when j.booked_from is not null and j.slot_start < v_now then 'PAST'
             when j.booked_from is not null then 'BOOKED'
             when j.cleaning_from is not null
                  and j.cleaning_from <= v_now and v_now < j.cleaning_until then 'CLEANING'
             when j.cleaning_from is not null and j.slot_start < v_now then 'PAST'
             when j.cleaning_from is not null then 'CLEANING'
             when j.slot_start < v_now then 'PAST'
             else 'AVAILABLE'
           end as state
      from judged j
  )
  select
    s.slot_start,
    s.slot_end,
    s.state,
    case s.state
      when 'IN_USE'   then s.booked_until
      when 'BOOKED'   then s.booked_until
      when 'CLEANING' then s.cleaning_until
    end as ready_at,
    case s.state
      when 'IN_USE'   then s.booked_from
      when 'BOOKED'   then s.booked_from
      when 'CLEANING' then s.cleaning_from
    end as busy_from,
    case s.state
      when 'IN_USE'   then s.booked_until
      when 'BOOKED'   then s.booked_until
      when 'CLEANING' then s.cleaning_until
    end as busy_until,
    case s.state
      when 'IN_USE'   then 'BOOKING'
      when 'BOOKED'   then 'BOOKING'
      when 'CLEANING' then 'CLEANING'
    end as busy_kind
  from stated s
  order by s.slot_start;
end;
$$;

grant execute on function public.slot_availability(text, text, date, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) latest_extendable: NULL = tidak ada yang menghalangi
-- ---------------------------------------------------------------------------
create or replace function public.latest_extendable(p_booking_id text)
returns timestamptz
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with b as (
    select booking_id, unit_id, scheduled_end_at, status
      from bookings
     where booking_id = p_booking_id
  ),
  blocking as (
    select min(lower(r.period)) as boundary
      from b
      join unit_reservations r
        on r.unit_id = b.unit_id
       and r.booking_id is distinct from b.booking_id
       and lower(r.period) >= b.scheduled_end_at
  )
  select case
           when (select status from b) in ('CONFIRMED', 'CHECKED_IN', 'IN_USE')
             -- NULL (bukan scheduled_end_at) berarti unit bebas setelah sesi ini.
             then (select boundary from blocking)
           else null
         end
    from b;
$$;

grant execute on function public.latest_extendable(text) to anon, authenticated;