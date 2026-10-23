-- =============================================================================
-- 0031_tournaments.sql
--
-- Turnamen: dari nol. Tidak ada satu pun tabel,\fungsi,\atau halaman tentang
-- turnamen di project ini — hanya teks marketing ("arena turnamen") dan
-- game_requests yang beda fungsi.
--
-- Yang dipakai ulang, bukan ditulis ulang:
--   customers + find_or_create_customer()  → pesertaenciales
--   payments + convertQRIS()               → HTM dibayar QRIS statis / kasir
--   payment_proofs                          → bukti bayar manual
--   notifications                           → antrean WhatsApp (tabel sudah ada,
--                                            belum pernah dipakai)
--   media bucket + uploadMedia()            → poster
--
-- Aturan bisnis yang dikodekan di sini (T1–T12):
--   T1  pendaftaran hanya saat status OPEN dan belum lewat registration_closes_at
--   T2  satu nomor WA = satu slot per turnamen (unique), supaya orang tidak bisa
--      Warmplaceholder
--   T3  kuota dihitung dari peserta yang masih memegang slot (menunggu bayar, lunas,
--       hadir). Expired/cancelled melepas slot.
--   T4  fee = 0 → lunas seketika, tanpa halaman pembayaran sama sekali
--   T5  fee > 0 → harus lunas sebelum deadline (default 30 menit, sama seperti
--       booking); lewat = EXPIRED dan slot balik terbuka
--   T6  fee di-snapshot ke fee_amount saat pendaftaran, jadi mengubah fee di admin
--       tidak menyentuh peserta yang sudah daftar
--   T7  pembayaran punya satu pemilik: booking / extension / registration
--   T8  bracket dibangun dari seed, single elimination, bye otomatis untuk seed
--       tinggi bila jumlah peserta bukan powerhouse dua
--   T9  skor seri → match tetap READY (main ulang), bukan drierect keslot berikutnya
--   T10 nama peserta didenormalisasi ke tournament_matches supaya bracket publik
--       tidak perlu membaca tabel registrations (yang berisi nomor telepon)
--   T11 check-in butuh status lunas dulu
--   T12 pendaftaran yang dibatalkan kasir → slot dilepas, dan pemain yang sempat
--       menang lewat bye dicabut supaya orang tidak datang tidak melaju ke final
--
-- rental/booking tidak disentuh: peserta forfeit bukan booking, tidak memakai unit.
-- =============================================================================

create sequence if not exists tournaments_seq start 1;
create sequence if not exists tournament_matches_seq start 1;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type tournament_status as enum ('DRAFT', 'OPEN', 'FULL', 'ONGOING', 'DONE', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tournament_registration_status as enum
    ('WAITING_PAYMENT', 'PAID', 'CHECKED_IN', 'CANCELLED', 'EXPIRED', 'DISQUALIFIED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tournament_match_status as enum ('WAITING', 'READY', 'FINISHED');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------
create table if not exists tournaments (
  tournament_id          text primary key
                           default ('TRN-' || lpad(nextval('tournaments_seq')::text, 4, '0')),
  title                  text not null check (char_length(title) between 3 and 120),
  slug                   text not null unique,
  game_id                text references games (game_id) on delete set null,
  branch_id              text not null references branches (branch_id) on delete restrict,
  poster_url             text,
  description            text check (description is null or char_length(description) <= 2000),
  rules                  text check (rules is null or char_length(rules) <= 2000),
  prize                  text check (prize is null or char_length(prize) <= 300),
  starts_at              timestamptz not null,
  registration_closes_at timestamptz,
  -- yang ditagih. 0 = gratis, dan registrasi langsung lunas (T4).
  registration_fee       integer not null default 0 check (registration_fee >= 0),
  -- harga yang dicoret di sebelah stiker GRATIS. Nullable: turno gratis tanpa harga
  -- coret sama sekalinya boleh, tidak semua CWK memakai gaya itu.
  list_price             integer check (list_price is null or list_price > 0),
  quota                  integer not null check (quota between 2 and 512),
  -- tinggi posisi di bracket, dipakai untuk memberi bye ke seed teratas (T8).
  bracket_size           integer check (bracket_size is null or bracket_size >= 2),
  payment_window_minutes integer not null default 30 check (payment_window_minutes between 5 and 1440),
  status                 tournament_status not null default 'DRAFT',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- list_price hanya ada artinya kalau turnamennya gratis. Tanpa ini admin bisa
  -- menampilkan "Rp 100.000 dicoret / GRATIS" padahal yang ditagih Rp 150.000.
  constraint tournaments_free_sticker_shape check (
    registration_fee > 0 or list_price is null or list_price > 0
  ),
  constraint tournaments_closes_before_start check (
    registration_closes_at is null or registration_closes_at <= starts_at
  )
);

create index if not exists tournaments_status_starts_idx
  on tournaments (status, starts_at desc);
create index if not exists tournaments_branch_idx on tournaments (branch_id);

drop trigger if exists tournaments_set_updated_at on tournaments;
create trigger tournaments_set_updated_at
  before update on tournaments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tournament_registrations
-- ---------------------------------------------------------------------------
create table if not exists tournament_registrations (
  registration_id      text primary key
                         default ('REG-' || lpad(nextval('tournaments_seq')::text, 4, '0')),
  -- kode yangDicetak di tiket dan diketik pelanggan di /cek-turnamen.
  registration_code    text not null unique,
  tournament_id        text not null references tournaments (tournament_id) on delete cascade,
  customer_id          text not null references customers (customer_id) on delete restrict,
  name                 text not null check (char_length(trim(name)) between 2 and 80),
  phone                text not null,
  -- T6: harga saat daftar, bukan harga tournament hari ini.
  fee_amount           integer not null check (fee_amount >= 0),
  status               tournament_registration_status not null,
  seed_number          integer check (seed_number is null or seed_number >= 1),
  payment_deadline_at  timestamptz,
  paid_at              timestamptz,
  checked_in_at        timestamptz,
  cancel_reason        text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  notes                text check (notes is null or char_length(notes) <= 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- T2: satu nomor, satu slot per turnamen.
  constraint tournament_registrations_phone_unique unique (tournament_id, phone),
  -- T5: deadline hanya ada kalau memang ada yang harus dibayar.
  constraint tournament_registrations_deadline_shape check (
    fee_amount = 0 or payment_deadline_at is not null
  )
);

create index if not exists tournament_registrations_tournament_idx
  on tournament_registrations (tournament_id, status);
create index if not exists tournament_registrations_status_deadline_idx
  on tournament_registrations (status, payment_deadline_at)
  where status = 'WAITING_PAYMENT';
create index if not exists tournament_registrations_customer_idx
  on tournament_registrations (customer_id, created_at desc);

drop trigger if exists tournament_registrations_set_updated_at on tournament_registrations;
create trigger tournament_registrations_set_updated_at
  before update on tournament_registrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tournament_matches
-- ---------------------------------------------------------------------------
create table if not exists tournament_matches (
  match_id               text primary key
                           default ('MCH-' || lpad(nextval('tournament_matches_seq')::text, 5, '0')),
  tournament_id          text not null references tournaments (tournament_id) on delete cascade,
  round_no               smallint not null check (round_no >= 1),
  match_no               smallint not null check (match_no >= 1),
  slot_a_registration_id text references tournament_registrations (registration_id) on delete set null,
  slot_b_registration_id text references tournament_registrations (registration_id) on delete set null,
  -- T10: nama di-snapshot saat bracket dibangun, supaya bracket publik tidak
  -- perlu akses baca ke registrations — tabel itu berisi nomor telepon.
  player_a_name          text,
  player_b_name          text,
  player_a_seed          integer,
  player_b_seed          integer,
  score_a                smallint check (score_a is null or score_a >= 0),
  score_b                smallint check (score_b is null or score_b >= 0),
  winner_registration_id text references tournament_registrations (registration_id) on delete set null,
  status                 tournament_match_status not null default 'WAITING',
  next_match_id          text references tournament_matches (match_id) on delete set null,
  next_slot              char(1) check (next_slot in ('A', 'B')),
  started_at             timestamptz,
  finished_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint tournament_matches_identity unique (tournament_id, round_no, match_no),
  -- One match produces exactly one winner, and it has to be one of the two players:
-- this is what stops a typo'd registration id from taking a whole round out.
  constraint tournament_matches_winner_in_match check (
    winner_registration_id is null
    or winner_registration_id in (slot_a_registration_id, slot_b_registration_id)
  ),
  -- Match yang selesai harus punya pemenang, dan-tscore yang jelas.
  constraint tournament_matches_finished_shape check (
    status <> 'FINISHED' or winner_registration_id is not null
  )
);

create index if not exists tournament_matches_tournament_round_idx
  on tournament_matches (tournament_id, round_no, match_no);

drop trigger if exists tournament_matches_set_updated_at on tournament_matches;
create trigger tournament_matches_set_updated_at
  before update on tournament_matches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments / payment_proofs: third owner (T7)
-- ---------------------------------------------------------------------------
alter table payments
  add column if not exists tournament_registration_id
    text references tournament_registrations (registration_id) on delete cascade;

alter table payments drop constraint if exists payments_owner_xor;
alter table payments add constraint payments_owner_xor check (
  (booking_id is not null)::int
  + (extension_id is not null)::int
  + (tournament_registration_id is not null)::int = 1
);

create index if not exists payments_registration_idx
  on payments (tournament_registration_id)
  where tournament_registration_id is not null;

-- payment_proofs.booking_id dibuat nullable supaya bukti HTM bisa masuk lewat
-- registration; check nya replaces NOT NULL supaya satu bukti tidak bisa nempel
-- ke booking sekaligus registration.
alter table payment_proofs
  add column if not exists tournament_registration_id
    text references tournament_registrations (registration_id) on delete cascade;
alter table payment_proofs alter column booking_id drop not null;
alter table payment_proofs drop constraint if exists payment_proofs_owner_xor;
alter table payment_proofs add constraint payment_proofs_owner_xor check (
  (booking_id is not null)::int + (tournament_registration_id is not null)::int = 1
);
create index if not exists payment_proofs_registration_created_idx
  on payment_proofs (tournament_registration_id, created_at desc)
  where tournament_registration_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table tournaments            enable row level security;
alter table tournament_registrations enable row level security;
alter table tournament_matches    enable row level security;

-- Turnamen yang tayang dan bracket-nya publik; registrasi tidak, karena berisi
-- nama + nomor telepon. Peserta membaca barisnya sendiri lewat service role
-- (route /api), bukan anon — jadi tidak perlu policy untuk customer.
drop policy if exists "public read tournaments" on tournaments;
create policy "public read tournaments" on tournaments
  for select to anon, authenticated using (status in ('OPEN', 'FULL', 'ONGOING', 'DONE'));
drop policy if exists "public read tournament_matches" on tournament_matches;
create policy "public read tournament_matches" on tournament_matches
  using (exists (
    select 1 from tournaments t
     where t.tournament_id = tournament_matches.tournament_id
       and t.status in ('OPEN', 'FULL', 'ONGOING', 'DONE')
  ));

-- Tulisannya lewat service_role (RPC SECURITY DEFINER + route admin), jadi tidak
-- ada policy insert/update/delete di sini.

-- ---------------------------------------------------------------------------
-- public overview read
--
-- The public card needs to know how many seats are taken, but tournament_registrations
-- holds names and phone numbers and stays unreadable to anon. So the count comes from
-- here: a definer function that returns aggregate rows only, never a registration.
--
-- Passing a slug returns just that tournament, which is what the detail page reads, so
-- list and detail share one shape and cannot drift.
-- ---------------------------------------------------------------------------
create or replace function public.public_tournament_overview(p_slug text default null)
returns table(
  tournament_id          text,
  slug                   text,
  title                  text,
  description            text,
  rules                  text,
  prize                  text,
  poster_url             text,
  starts_at              timestamptz,
  registration_closes_at timestamptz,
  registration_fee       integer,
  list_price             integer,
  quota                  integer,
  status                 tournament_status,
  game_name              text,
  branch_id              text,
  branch_name            text,
  branch_short_name      text,
  held                   integer
)
language sql
stable
security definer
set search_path = 'public', 'extensions'
as $$
  select t.tournament_id,
         t.slug,
         t.title,
         t.description,
         t.rules,
         t.prize,
         t.poster_url,
         t.starts_at,
         t.registration_closes_at,
         t.registration_fee,
         t.list_price,
         t.quota,
         t.status,
         g.name,
         t.branch_id,
         b.name,
         b.short_name,
         (select count(*)::int
            from tournament_registrations r
           where r.tournament_id = t.tournament_id
             and r.status in ('WAITING_PAYMENT', 'PAID', 'CHECKED_IN'))
    from tournaments t
    left join games g on g.game_id = t.game_id
    join branches b on b.branch_id = t.branch_id
   where t.status in ('OPEN', 'FULL', 'ONGOING', 'DONE')
     and (p_slug is null or t.slug = p_slug)
   order by t.starts_at asc;
$$;

-- ---------------------------------------------------------------------------
-- notification queue
--
-- registrations sekarang punya pemicu yang menulis satu baris PENDING per kejadian.
-- Pengirim (Fonnte/Wablas) dijalankan dari service layer, bukan dari database:
-- pemanggilnya butuh API key dan timeout, yang tidakbelongs di dalam transaksi.
-- Kolom template + payload sengaja disimpan terpisah supaya satu baris antrean
-- bisa dibaca kasir sebagai "apa yang harus bilang".
-- ---------------------------------------------------------------------------
create or replace function public.queue_tournament_notification(
  p_registration_id text,
  p_template        text,
  p_payload         jsonb
)
returns void
language sql
security definer
set search_path = 'public', 'extensions'
as $$
  insert into notifications (recipient_type, recipient_ref, channel, template, payload)
  select 'CUSTOMER', r.phone, 'WHATSAPP', p_template, p_payload
    from tournament_registrations r
   where r.registration_id = p_registration_id;
$$;

-- ---------------------------------------------------------------------------
-- bracket maths (T8)
--
-- Seed placement single elimination. The recursion is the standard one:
--   order(2s)[2i-1] = order(s)[i]
--   order(2s)[2i]   = 2s + 1 - order(s)[i]
-- which yields [1,2] → [1,4,2,3] → [1,8,4,5,2,7,3,6]: seed 1 only ever
-- meets the bottom seed, and the final is always 1 vs n.
-- ---------------------------------------------------------------------------
create or replace function public.tournament_seed_order(p_size integer)
returns integer[]
language plpgsql
immutable
set search_path = 'public', 'extensions'
as $$
declare
  v_order integer[] := array[1];
  v_next  integer[];
  v_size  integer := 1;
  v_i     integer;
begin
  if p_size is null or p_size < 2 then return array[1]; end if;

  while v_size < p_size loop
    v_size := v_size * 2;
    v_next := array[]::integer[];
    for v_i in 1 .. coalesce(array_length(v_order, 1), 0) loop
      v_next := array_append(v_next, v_order[v_i]);
      v_next := array_append(v_next, v_size + 1 - v_order[v_i]);
    end loop;
    v_order := v_next;
  end loop;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- registrations
-- ---------------------------------------------------------------------------

-- Kode registrasi, alfabet yang sama seperti booking code (tanpa I/O/0/1 supaya
-- tidak tertukar jadi 1/l di kasir).
create or replace function public.generate_registration_code()
returns text
language plpgsql
volatile
set search_path = 'public', 'extensions'
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
  end loop;
  return 'TRN-' || result;
end;
$$;

/**
 * register_tournament() - the whole T1/T2/T3/T4/T6 contract in one transaction.
 *
 * The slot count is taken under a row lock on the tournament, because two
 * registrations arriving at once on the last free slot would otherwise both read
 * "one seat left" and both be written. Same shape as create_booking()'s slot lock.
 */
create or replace function public.register_tournament(
  p_tournament_id text,
  p_name          text,
  p_phone         text,
  p_notes         text default null
)
returns table(
  registration_id      text,
  registration_code    text,
  status               tournament_registration_status,
  fee_amount           integer,
  payment_deadline_at  timestamptz,
  tournament_title     text,
  starts_at            timestamptz,
  branch_name          text
)
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_t        tournaments;
  v_held     integer;
  v_customer text;
  v_reg_id   text;
  v_code     text;
  v_status   tournament_registration_status;
  v_fee      integer;
  v_deadline timestamptz;
begin
  -- lock the tournament: quota is decided here (T3)
  select * into v_t from tournaments where tournament_id = p_tournament_id for update;
  if not found then
    raise exception 'turnamen tidak ditemukan' using errcode = '22023';
  end if;
  if v_t.status <> 'OPEN' then
    raise exception 'turnstile tidak menerima pendaftaran (status %)', v_t.status using errcode = '22023';
  end if;
  if v_t.registration_closes_at is not null and now() >= v_t.registration_closes_at then
    raise exception 'pendaftaran sudah ditutup' using errcode = '22023';
  end if;

  v_held := (
    select count(*)::int from tournament_registrations r
     where r.tournament_id = p_tournament_id
       and r.status in ('WAITING_PAYMENT', 'PAID', 'CHECKED_IN')
  );
  if v_held >= v_t.quota then
    raise exception 'kuota penuh (%/%)', v_held, v_t.quota using errcode = '22023';
  end if;

  -- T2: one phone, one seat. Reported separately from the quota check so the
  -- customer is told "you already have a slot" instead of "full".
  if exists (
    select 1 from tournament_registrations r
     where r.tournament_id = p_tournament_id and r.phone = btrim(p_phone)
  ) then
    raise exception 'nomor ini sudah terdaftar di turnamen ini' using errcode = '22023';
  end if;

  v_customer := find_or_create_customer(btrim(p_name), btrim(p_phone));
  v_reg_id   := 'REG-' || lpad(nextval('tournaments_seq')::text, 4, '0');
  v_code     := public.generate_registration_code();
  v_fee      := v_t.registration_fee;

  -- T4: free tournament is settled on the spot, so there is no payment page and
  -- no deadline for it. T6: whatever the fee is now is what this seat is worth.
  if v_fee = 0 then
    v_status   := 'PAID';
    v_deadline := null;
  else
    v_status   := 'WAITING_PAYMENT';
    v_deadline := now() + make_interval(mins => v_t.payment_window_minutes);
  end if;

  insert into tournament_registrations (
    registration_id, registration_code, tournament_id, customer_id,
    name, phone, fee_amount, status, payment_deadline_at, paid_at, notes
  ) values (
    v_reg_id, v_code, p_tournament_id, v_customer,
    btrim(p_name), btrim(p_phone), v_fee, v_status, v_deadline,
    case when v_fee = 0 then now() else null end,
    nullif(btrim(coalesce(p_notes, '')), '')
  );

  perform public.queue_tournament_notification(
    v_reg_id,
    case when v_fee = 0 then 'TOURNAMENT_REGISTERED_FREE' else 'TOURNAMENT_REGISTERED_PENDING_PAYMENT' end,
    jsonb_build_object('registration_code', v_code, 'tournament_title', v_t.title)
  );

  return query
    select v_reg_id, v_code, v_status, v_fee, v_deadline, v_t.title, v_t.starts_at, b.name
      from branches b where b.branch_id = v_t.branch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- payment at the counter (T5)
--
-- One call creates the PAID payment row and settles the registration, so there is
-- no window where the seat is marked paid but nothing was recorded in the till.
-- ---------------------------------------------------------------------------
create or replace function public.settle_tournament_registration(
  p_registration_id text,
  p_method          payment_method,
  p_created_by      uuid default null,
  p_notes           text default null
)
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_reg tournament_registrations;
  v_pay text;
begin
  select * into v_reg from tournament_registrations r
   where r.registration_id = p_registration_id for update;
  if not found then
    raise exception 'pendaftaran tidak ditemukan' using errcode = '22023';
  end if;
  if v_reg.status not in ('WAITING_PAYMENT', 'PAID') then
    raise exception 'pendaftaran % tidak bisa dilunasi (%status)', v_reg.registration_code, v_reg.status
      using errcode = '22023';
  end if;
  if v_reg.fee_amount = 0 then
    raise exception 'pendaftaran ini gratis, tidak ada yang perlu dilunasi' using errcode = '22023';
  end if;
  if p_method not in ('CASH', 'QRIS_MANUAL', 'TRANSFER_MANUAL') then
    raise exception 'metode % bukan metode kasir', p_method using errcode = '22023';
  end if;

  if v_reg.status = 'PAID' then
    -- already settled by QRIS: a second manual payment is a double charge, not a no-op
    raise exception 'pendaftaran ini sudah lunas' using errcode = '22023';
  end if;

  v_pay := 'PAY-' || lpad(nextval('payments_seq')::text, 6, '0');
  insert into payments (
    payment_id, tournament_registration_id, provider, method, status,
    gross_amount, paid_at, raw_response
  ) values (
    v_pay, p_registration_id,
    case when p_method = 'CASH' then 'CASH'::payment_provider else 'MANUAL'::payment_provider end,
    p_method, 'PAID', v_reg.fee_amount, now(),
    jsonb_build_object('settled_by', 'counter', 'notes', nullif(btrim(coalesce(p_notes, '')), ''))
  );

  update tournament_registrations
     set status = 'PAID', paid_at = coalesce(paid_at, now())
   where registration_id = p_registration_id;

  perform public.queue_tournament_notification(
    p_registration_id,
    'TOURNAMENT_PAID',
    jsonb_build_object('registration_code', v_reg.registration_code)
  );

  return v_reg.fee_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- QRIS: the same dynamic-amount string the booking flow builds, pointed at a
-- registration instead of a booking.
-- ---------------------------------------------------------------------------
create or replace function public.create_tournament_payment(
  p_registration_id text
)
returns text
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_reg  tournament_registrations;
  v_live text;
  v_pay  text;
begin
  select * into v_reg from tournament_registrations r
   where r.registration_id = p_registration_id for update;
  if not found then
    raise exception 'pendaftaran tidak ditemukan' using errcode = '22023';
  end if;
  if v_reg.status <> 'WAITING_PAYMENT' then
    raise exception 'pendaftaran tidak menunggu pembayaran (status %)', v_reg.status using errcode = '22023';
  end if;
  if v_reg.fee_amount = 0 then
    raise exception 'pendaftaran ini gratis' using errcode = '22023';
  end if;
  if v_reg.payment_deadline_at is not null and now() > v_reg.payment_deadline_at then
    raise exception 'batas pembayaran sudah lewat' using errcode = '22023';
  end if;

  select payment_id into v_live from payments
   where tournament_registration_id = p_registration_id
     and status in ('PENDING', 'PAID')
   limit 1;
  if v_live is not null then
    return v_live;  -- idempotent: the page reloads and re-requests
  end if;

  v_pay := 'PAY-' || lpad(nextval('payments_seq')::text, 6, '0');
  insert into payments (
    payment_id, tournament_registration_id, provider, method, status,
    gross_amount, expires_at
  ) values (
    v_pay, p_registration_id, 'CASAKU', 'CASAKU_QR_DYNAMIC', 'PENDING',
    v_reg.fee_amount, v_reg.payment_deadline_at
  );

  return v_pay;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark a QRIS payment paid (the confirmation the counter or the proof review does)
-- ---------------------------------------------------------------------------
create or replace function public.settle_tournament_payment(p_payment_id text)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_pay payments;
begin
  select * into v_pay from payments where payment_id = p_payment_id for update;
  if not found then
    raise exception 'pembayaran tidak ditemukan' using errcode = '22023';
  end if;
  if v_pay.tournament_registration_id is null then
    raise exception 'pembayaran ini bukan pembayaran pendaftaran' using errcode = '22023';
  end if;
  if v_pay.status = 'PAID' then return true; end if;
  if v_pay.status not in ('PENDING', 'EXPIRED') then
    raise exception 'pembayaran tidak bisa diselesaikan (%status)', v_pay.status using errcode = '22023';
  end if;

  update payments
     set status = 'PAID', paid_at = coalesce(paid_at, now())
   where payment_id = p_payment_id;

  update tournament_registrations
     set status = 'PAID', paid_at = coalesce(paid_at, now())
   where registration_id = v_pay.tournament_registration_id
     and status = 'WAITING_PAYMENT';

  perform public.queue_tournament_notification(
    v_pay.tournament_registration_id,
    'TOURNAMENT_PAID',
    jsonb_build_object('payment_id', p_payment_id)
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- T5/T12: sweeping, check-in, cancelling
-- ---------------------------------------------------------------------------
create or replace function public.expire_tournament_registrations()
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_rows integer;
begin
  update tournament_registrations
     set status = 'EXPIRED'
   where status = 'WAITING_PAYMENT'
     and payment_deadline_at is not null
     and now() > payment_deadline_at;
  get diagnostics v_rows = row_count;

  update payments p
     set status = 'EXPIRED'
   where p.tournament_registration_id in (
           select r.registration_id from tournament_registrations r
            where r.status = 'EXPIRED' and r.fee_amount > 0)
     and p.status = 'PENDING';

  -- A FULL tournament whose unpaid seats just expired is bookable again (T3).
  update tournaments t
     set status = 'OPEN'
   where t.status = 'FULL'
     and (select count(*)::int from tournament_registrations r
           where r.tournament_id = t.tournament_id
             and r.status in ('WAITING_PAYMENT', 'PAID', 'CHECKED_IN')) < t.quota;

  return v_rows;
end;
$$;

/** T11: presence cannot be checked in before the fee is settled. */
create or replace function public.check_in_tournament_registration(p_registration_id text)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_status tournament_registration_status;
begin
  select status into v_status from tournament_registrations
   where registration_id = p_registration_id for update;
  if v_status is null then
    raise exception 'pendaftaran tidak ditemukan' using errcode = '22023';
  end if;
  if v_status not in ('PAID', 'CHECKED_IN') then
    raise exception 'belum lunas, tidak bisa check-in (%status)', v_status using errcode = '22023';
  end if;

  update tournament_registrations
     set status = 'CHECKED_IN', checked_in_at = coalesce(checked_in_at, now())
   where registration_id = p_registration_id;

  return true;
end;
$$;

/** T12: releasing a seat also has to pull the player out of the bracket. */
create or replace function public.cancel_tournament_registration(
  p_registration_id text,
  p_reason          text default null
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_status   tournament_registration_status;
  v_vacated  text;
begin
  select status into v_status from tournament_registrations
   where registration_id = p_registration_id for update;
  if v_status is null then
    raise exception 'pendaftaran tidak ditemukan' using errcode = '22023';
  end if;
  if v_status = 'CANCELLED' then return true; end if;

  update tournament_registrations
     set status = 'CANCELLED', cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where registration_id = p_registration_id;

  -- Detach from every slot, played matches included. Leaving them in a finished match
-- would let the resolver crown a no-show again: a bye winner occupies its slot with no
-- opponent, so nulling only the unplayed ones keeps a ghost in the draw.
  update tournament_matches
     set slot_a_registration_id = null,
         player_a_name = null,
         player_a_seed = null,
         score_a = null
   where slot_a_registration_id = p_registration_id;
  update tournament_matches
     set slot_b_registration_id = null,
         player_b_name = null,
         player_b_seed = null,
         score_b = null
   where slot_b_registration_id = p_registration_id;

  -- A player who walked through a bye is recorded as the winner of that match. Leaving
  -- it would hand a no-show the next round — and, in a bracket short on players, the
  -- whole tournament. Reset those matches and let the resolver decide again: whoever is
  -- actually left advances, and a match with nobody in it falls back to WAITING.
  for v_vacated in
    select match_id from tournament_matches where winner_registration_id = p_registration_id
  loop
    update tournament_matches
       set winner_registration_id = null,
           score_a = null,
           score_b = null,
           status = 'WAITING',
           finished_at = null
     where match_id = v_vacated;

    perform public.resolve_tournament_match(v_vacated);
  end loop;

  perform public.queue_tournament_notification(
    p_registration_id,
    'TOURNAMENT_CANCELLED',
    jsonb_build_object('registration_code', (select registration_code from tournament_registrations where registration_id = p_registration_id))
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- T8/T9: seeding + bracket (T8/T9)
-- ---------------------------------------------------------------------------

/**
 * reset_tournament_bracket() - the escape hatch build_tournament_bracket() refuses
 * without.
 *
 * Clears the tree and the seed numbers, leaving the paid seats alone. The guard inside
 * build_tournament_bracket() exists so nobody wipes a tournament's results by accident;
 * this is the deliberate counterpart, called only from the admin panel behind a
 * confirmation that spells out what it destroys.
 */
create or replace function public.reset_tournament_bracket(p_tournament_id text)
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_rows integer;
begin
  if not exists (select 1 from tournaments where tournament_id = p_tournament_id) then
    raise exception 'turnamen tidak ditemukan' using errcode = '22023';
  end if;

  delete from tournament_matches where tournament_id = p_tournament_id;
  get diagnostics v_rows = row_count;

  -- Seeding is derived state, not a fact about the player, so it goes too. Without this
  -- a rebuild would reuse the old draw, which is the one thing a reset is meant to fix.
  update tournament_registrations
     set seed_number = null
   where tournament_id = p_tournament_id;

  return v_rows;
end;
$$;

/**
 * assign_seeds() - paid seats numbered by who locked in first.
 *
 * paid_at rather than created_at: a free registration has paid_at set at insert,
 * so "who got here first" stays meaningful when a tournament is free.
 */
create or replace function public.assign_tournament_seeds(p_tournament_id text)
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_count integer;
begin
  with ranked as (
    select r.registration_id,
           row_number() over (order by coalesce(r.paid_at, r.created_at), r.created_at)::int as seed
      from tournament_registrations r
     where r.tournament_id = p_tournament_id
       and r.status in ('PAID', 'CHECKED_IN')
  )
  update tournament_registrations r
     set seed_number = ranked.seed
    from ranked
   where r.registration_id = ranked.registration_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * resolve_tournament_match() - the one place that decides a match's state.
 *
 *   both slots empty        -> WAITING
 *   one slot filled         -> FINISHED, that player advances (this is the bye, T8)
 *   both filled, no scores  -> READY
 *   both filled, scores set -> FINISHED, higher score advances
 *   scores level            -> stays READY with the scores cleared: a draw needs a
 *                              replay (T9), and silently advancing one side would
 *                              hand the win to whoever the operator typed first.
 *
 * Cascades into the next match so a run of byes resolves in one pass.
 */
create or replace function public.resolve_tournament_match(p_match_id text, p_depth integer default 0)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_m       tournament_matches;
  v_winner  text;
  v_name    text;
  v_seed    integer;
  v_next    text;
  v_next_id text;
  v_next_sl char(1);
begin
  -- a run of byes is at most log2(size) deep; the guard stops a cycle from hanging
  if p_depth > 16 then return false; end if;

  select * into v_m from tournament_matches where match_id = p_match_id for update;
  if not found then return false; end if;

  if v_m.slot_a_registration_id is null and v_m.slot_b_registration_id is null then
    update tournament_matches
       set status = 'WAITING', winner_registration_id = null,
           score_a = null, score_b = null, finished_at = null
     where match_id = p_match_id;
    return false;
  end if;

  if v_m.slot_a_registration_id is not null and v_m.slot_b_registration_id is null then
    v_winner := v_m.slot_a_registration_id;
  elsif v_m.slot_a_registration_id is null and v_m.slot_b_registration_id is not null then
    v_winner := v_m.slot_b_registration_id;
  elsif v_m.score_a is null or v_m.score_b is null then
    update tournament_matches
       set status = 'READY', winner_registration_id = null,
           started_at = coalesce(started_at, now()), finished_at = null
     where match_id = p_match_id;
    return false;
  elsif v_m.score_a > v_m.score_b then
    v_winner := v_m.slot_a_registration_id;
  elsif v_m.score_b > v_m.score_a then
    v_winner := v_m.slot_b_registration_id;
  else
    -- T9: a draw is not a result.
    update tournament_matches
       set status = 'READY', winner_registration_id = null,
           score_a = null, score_b = null
     where match_id = p_match_id;
    return false;
  end if;

  update tournament_matches
     set status = 'FINISHED', winner_registration_id = v_winner,
         started_at = coalesce(started_at, now()), finished_at = now()
   where match_id = p_match_id;

  select registration_id, name, seed_number into v_next, v_name, v_seed
    from tournament_registrations where registration_id = v_winner;
  v_next_id := v_m.next_match_id;
  v_next_sl := v_m.next_slot;

  if v_next_id is null then return true; end if;  -- champion

  if v_next_sl = 'A' then
    update tournament_matches
       set slot_a_registration_id = v_next, player_a_name = v_name, player_a_seed = v_seed
     where match_id = v_next_id;
  else
    update tournament_matches
       set slot_b_registration_id = v_next, player_b_name = v_name, player_b_seed = v_seed
     where match_id = v_next_id;
  end if;

  perform public.resolve_tournament_match(v_next_id, p_depth + 1);
  return true;
end;
$$;

/**
 * build_tournament_bracket() - single elimination from the seeds.
 *
 * Rebuilding is destructive by design: a bracket that survived an extra entrant is
 * harder to reason about than one regenerated from the current seed list, and the
 * public page reads whatever is stored. The button is therefore only offered when
 * no match has been finished yet.
 *
 * Three passes, in this order, and the order matters:
 *   1. insert every match of every round (a match's next_match_id has to point at a
 *      row that already exists, so linking cannot happen while round r+1 is still
 *      being created)
 *   2. wire the links and drop the seeds into round 1
 *   3. resolve, which cascades through the byes above round 1
 */
create or replace function public.build_tournament_bracket(p_tournament_id text)
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_entrants  integer;
  v_size      integer;
  v_rounds    integer;
  v_r         integer;
  v_m         integer;
  v_per_round integer;
  v_order     integer[];
  v_filled    integer;
  v_seed      integer;
  v_reg       text;
  v_name      text;
begin
  perform public.assign_tournament_seeds(p_tournament_id);

  select count(*)::int into v_entrants
    from tournament_registrations r
   where r.tournament_id = p_tournament_id
     and r.status in ('PAID', 'CHECKED_IN');

  if v_entrants < 2 then
    raise exception 'butuh minimal 2 peserta lunas untuk menyusun bracket (sekarang %)', v_entrants
      using errcode = '22023';
  end if;

  if exists (
    select 1 from tournament_matches m
     where m.tournament_id = p_tournament_id and m.status = 'FINISHED'
  ) then
    raise exception 'bracket sudah played — reset dulu dari admin jika ingin menyusun ulang'
      using errcode = '22023';
  end if;

  -- Round sizes by repeated halving, never `2 ^ n`: for integers `^` is bitwise XOR
  -- in PostgreSQL (2^2 = 0), which silently produced one match per round and a
  -- division by zero on the next.
  v_size := 2;
  while v_size < v_entrants loop v_size := v_size * 2; end loop;
  v_rounds := 0;
  v_per_round := v_size;
  while v_per_round > 1 loop
    v_rounds := v_rounds + 1;
    v_per_round := v_per_round / 2;
  end loop;

  delete from tournament_matches where tournament_id = p_tournament_id;

  -- pass 1: rows only
  v_per_round := v_size / 2;
  for v_r in 1..v_rounds loop
    for v_m in 1..v_per_round loop
      insert into tournament_matches (tournament_id, round_no, match_no)
      values (p_tournament_id, v_r, v_m);
    end loop;
    v_per_round := v_per_round / 2;
  end loop;

  -- pass 2: links, then the round-1 draw
  if v_rounds > 1 then
    update tournament_matches m
       set next_match_id = (
             select nxt.match_id from tournament_matches nxt
              where nxt.tournament_id = p_tournament_id
                and nxt.round_no = m.round_no + 1
                and nxt.match_no = ((m.match_no + 1) / 2)
           ),
           next_slot = case when m.match_no % 2 = 1 then 'A' else 'B' end
     where m.tournament_id = p_tournament_id
       and m.round_no < v_rounds;
  end if;

  v_order := public.tournament_seed_order(v_size);
  for v_m in 1 .. (v_size / 2) loop
    v_seed := v_order[(v_m - 1) * 2 + 1];
    if v_seed <= v_entrants then
      select r.registration_id, r.name into v_reg, v_name
        from tournament_registrations r
       where r.tournament_id = p_tournament_id and r.seed_number = v_seed;
      update tournament_matches
         set slot_a_registration_id = v_reg, player_a_name = v_name, player_a_seed = v_seed
       where tournament_id = p_tournament_id and round_no = 1 and match_no = v_m;
    end if;

    v_seed := v_order[(v_m - 1) * 2 + 2];
    if v_seed <= v_entrants then
      select r.registration_id, r.name into v_reg, v_name
        from tournament_registrations r
       where r.tournament_id = p_tournament_id and r.seed_number = v_seed;
      update tournament_matches
         set slot_b_registration_id = v_reg, player_b_name = v_name, player_b_seed = v_seed
       where tournament_id = p_tournament_id and round_no = 1 and match_no = v_m;
    end if;
  end loop;

  -- pass 3: byes above round 1 collapse in one sweep
  v_per_round := v_size / 2;
  for v_r in 1..v_rounds loop
    for v_m in 1..v_per_round loop
      perform public.resolve_tournament_match(
        (select match_id from tournament_matches t
          where t.tournament_id = p_tournament_id and t.round_no = v_r and t.match_no = v_m));
    end loop;
    v_per_round := v_per_round / 2;
  end loop;

  select count(*)::int into v_filled from tournament_matches where tournament_id = p_tournament_id;
  return v_filled;
end;
$$;

/**
 * report_tournament_match_result() - the operator types a score, everything
 * downstream follows.
 */
create or replace function public.report_tournament_match_result(
  p_match_id text,
  p_score_a  integer,
  p_score_b  integer
)
returns tournament_match_status
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_m      tournament_matches;
  v_status tournament_match_status;
begin
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'skor tidak valid' using errcode = '22023';
  end if;

  select * into v_m from tournament_matches where match_id = p_match_id for update;
  if not found then
    raise exception 'match tidak ditemukan' using errcode = '22023';
  end if;
  if v_m.slot_a_registration_id is null or v_m.slot_b_registration_id is null then
    raise exception 'match belum punya dua peserta' using errcode = '22023';
  end if;

  update tournament_matches
     set score_a = p_score_a, score_b = p_score_b
   where match_id = p_match_id;

  perform public.resolve_tournament_match(p_match_id);

  select status into v_status from tournament_matches where match_id = p_match_id;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- quota bookkeeping when the tournament itself is opened
-- ---------------------------------------------------------------------------
create or replace function public.sync_tournament_quota(p_tournament_id text)
returns text
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_status tournament_status;
  v_held   integer;
  v_quota  integer;
begin
  select t.status, t.quota into v_status, v_quota from tournaments t
   where t.tournament_id = p_tournament_id for update;
  if v_status is null then
    raise exception 'turnamen tidak ditemukan' using errcode = '22023';
  end if;
  if v_status not in ('OPEN', 'FULL') then return v_status; end if;

  select count(*)::int into v_held from tournament_registrations r
   where r.tournament_id = p_tournament_id
     and r.status in ('WAITING_PAYMENT', 'PAID', 'CHECKED_IN');

  if v_held >= v_quota then
    update tournaments set status = 'FULL' where tournament_id = p_tournament_id;
    return 'FULL';
  end if;

  update tournaments set status = 'OPEN' where tournament_id = p_tournament_id and status = 'FULL';
  return 'OPEN';
end;
$$;