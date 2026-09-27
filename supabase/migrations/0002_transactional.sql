-- =============================================================================
-- 0002_transactional.sql
-- Klub Sukaria — transactional schema
-- Booking, payment, extension, inventory, feedback, audit, notification.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('OWNER', 'ADMIN', 'STAFF');
create type booking_status as enum (
  'DRAFT', 'WAITING_PAYMENT', 'CONFIRMED', 'CHECKED_IN',
  'IN_USE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'
);
create type booking_source as enum ('ONLINE', 'WALK_IN');
create type booking_item_type as enum ('RENTAL', 'SNACK');
create type payment_provider as enum ('MIDTRANS', 'CASH', 'MANUAL');
create type payment_method as enum (
  'MIDTRANS_QRIS', 'MIDTRANS_GOPAY', 'MIDTRANS_SHOPEEPAY',
  'MIDTRANS_BANK_TRANSFER', 'MIDTRANS_CREDIT_CARD',
  'CASH', 'QRIS_MANUAL', 'TRANSFER_MANUAL'
);
create type payment_status as enum (
  'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED'
);
create type extension_status as enum (
  'REQUESTED', 'WAITING_PAYMENT', 'CONFIRMED', 'REJECTED', 'CANCELLED'
);
create type inventory_movement_type as enum ('IN', 'OUT', 'ADJUSTMENT', 'SALE');
create type request_status as enum (
  'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ADDED'
);
create type notification_recipient as enum ('CUSTOMER', 'ADMIN');
create type notification_status as enum ('PENDING', 'SENT', 'FAILED');

-- ---------------------------------------------------------------------------
-- Sequences for human-readable business ids
-- ---------------------------------------------------------------------------
create sequence customers_seq start 1;
create sequence bookings_seq start 1;
create sequence payments_seq start 1;
create sequence feedback_seq start 1;

-- SR-XXXXXX booking code generator.
-- ponytail: no retry loop here; collision odds are ~1e-8 and the unique
-- constraint on bookings.booking_code catches the rare clash so callers retry.
create or replace function public.generate_booking_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
  end loop;
  return 'SR-' || result;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (admin/staff) — mirrors auth.users
-- ---------------------------------------------------------------------------
create table profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  role        user_role not null default 'STAFF',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- customers (no login required)
-- ---------------------------------------------------------------------------
create table customers (
  customer_id       text primary key
                    default ('CUS-' || lpad(nextval('customers_seq')::text, 6, '0')),
  name              text not null,
  phone             text not null,
  email             text,
  total_booking     integer not null default 0,
  total_spending    bigint not null default 0,
  first_booking_at  timestamptz,
  last_booking_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index customers_phone_idx on customers (phone);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table bookings (
  booking_id            text primary key
                        default ('BK-' || lpad(nextval('bookings_seq')::text, 6, '0')),
  booking_code          text not null unique default public.generate_booking_code(),
  branch_id             text not null references branches (branch_id) on delete restrict,
  unit_id               text not null references units (unit_id) on delete restrict,
  customer_id           text not null references customers (customer_id) on delete restrict,
  source                booking_source not null default 'ONLINE',

  status                booking_status not null default 'DRAFT',
  scheduled_start_at    timestamptz not null,
  scheduled_end_at      timestamptz not null,
  latest_extendable_at  timestamptz,
  actual_start_at       timestamptz,
  actual_end_at         timestamptz,
  duration_minutes      integer not null check (duration_minutes > 0),

  game_id               text references games (game_id) on delete set null,
  rental_amount         integer not null default 0 check (rental_amount >= 0),
  snack_amount          integer not null default 0 check (snack_amount >= 0),
  discount_amount       integer not null default 0 check (discount_amount >= 0),
  total_amount          integer not null default 0 check (total_amount >= 0),

  payment_deadline_at   timestamptz,
  notes                 text,
  cancelled_reason      text,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint bookings_time_order check (scheduled_end_at > scheduled_start_at)
);

create index bookings_unit_time_idx on bookings (unit_id, scheduled_start_at, scheduled_end_at);
create index bookings_branch_status_idx on bookings (branch_id, status);
create index bookings_customer_idx on bookings (customer_id);
create index bookings_phone_lookup_idx on bookings (booking_code);
create index bookings_deadline_idx on bookings (payment_deadline_at)
  where status = 'WAITING_PAYMENT';

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- booking_items (rental line + snack lines)
-- ---------------------------------------------------------------------------
create table booking_items (
  booking_item_id  bigserial primary key,
  booking_id       text not null references bookings (booking_id) on delete cascade,
  item_type        booking_item_type not null,
  snack_id         text references snacks (snack_id) on delete restrict,
  description      text not null,
  quantity         integer not null default 1 check (quantity > 0),
  unit_price       integer not null check (unit_price >= 0),
  subtotal         integer not null check (subtotal >= 0),
  created_at       timestamptz not null default now()
);

create index booking_items_booking_idx on booking_items (booking_id);

-- ---------------------------------------------------------------------------
-- booking_extensions
-- ---------------------------------------------------------------------------
create table booking_extensions (
  extension_id            text primary key
                          default ('EXT-' || lpad(nextval('bookings_seq')::text, 6, '0')),
  booking_id              text not null references bookings (booking_id) on delete cascade,
  status                  extension_status not null default 'REQUESTED',
  previous_end_at         timestamptz not null,
  requested_minutes       integer not null check (requested_minutes > 0),
  new_end_at              timestamptz not null,
  amount                  integer not null default 0 check (amount >= 0),
  payment_deadline_at     timestamptz,
  rejected_reason         text,
  requested_by            uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index booking_extensions_booking_idx on booking_extensions (booking_id);

create trigger booking_extensions_set_updated_at
  before update on booking_extensions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table payments (
  payment_id        text primary key
                    default ('PAY-' || lpad(nextval('payments_seq')::text, 6, '0')),
  booking_id        text references bookings (booking_id) on delete cascade,
  extension_id      text references booking_extensions (extension_id) on delete cascade,
  provider          payment_provider not null,
  method            payment_method,
  status            payment_status not null default 'PENDING',
  gross_amount      integer not null check (gross_amount >= 0),
  provider_order_id text unique,
  provider_txn_id   text,
  paid_at           timestamptz,
  expires_at        timestamptz,
  raw_response      jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint payments_owner_xor check (
    (booking_id is not null)::int + (extension_id is not null)::int = 1
  )
);

create index payments_booking_idx on payments (booking_id);
create index payments_extension_idx on payments (extension_id);
create index payments_status_idx on payments (status);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_events (raw Midtrans webhook ledger + idempotency)
-- ---------------------------------------------------------------------------
create table payment_events (
  payment_event_id  bigserial primary key,
  payment_id        text references payments (payment_id) on delete cascade,
  provider_event_id text,
  event_type        text not null,
  signature_valid   boolean not null default false,
  payload           jsonb not null,
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- idempotency: a provider event may only be processed once
create unique index payment_events_provider_uniq
  on payment_events (provider_event_id) where provider_event_id is not null;

-- ---------------------------------------------------------------------------
-- unit_status_history
-- ---------------------------------------------------------------------------
create table unit_status_history (
  id          bigserial primary key,
  unit_id     text not null references units (unit_id) on delete cascade,
  from_status unit_status,
  to_status   unit_status not null,
  reason      text,
  booking_id  text references bookings (booking_id) on delete set null,
  actor_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index unit_status_history_unit_idx on unit_status_history (unit_id, created_at desc);

-- ---------------------------------------------------------------------------
-- inventory_movements (append-only stock ledger)
-- ---------------------------------------------------------------------------
create table inventory_movements (
  id             bigserial primary key,
  snack_id       text not null references snacks (snack_id) on delete restrict,
  movement_type  inventory_movement_type not null,
  qty_delta      integer not null,
  stock_after    integer not null,
  reason         text,
  booking_id     text references bookings (booking_id) on delete set null,
  actor_id       uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index inventory_movements_snack_idx on inventory_movements (snack_id, created_at desc);

-- keep snacks.stock in sync with the ledger
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
as $$
declare
  new_stock integer;
begin
  update snacks
     set stock = stock + new.qty_delta
   where snack_id = new.snack_id
  returning stock into new_stock;

  if new_stock is null then
    raise exception 'snack % not found', new.snack_id;
  end if;

  if new_stock < 0 then
    raise exception 'stock for % would go negative', new.snack_id;
  end if;

  new.stock_after := new_stock;
  return new;
end;
$$;

create trigger inventory_movements_apply
  before insert on inventory_movements
  for each row execute function public.apply_inventory_movement();

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
create table feedback (
  feedback_id        text primary key
                     default ('FB-' || lpad(nextval('feedback_seq')::text, 6, '0')),
  booking_id         text references bookings (booking_id) on delete set null,
  customer_id        text references customers (customer_id) on delete set null,
  rating             smallint not null check (rating between 1 and 5),
  service_rating     smallint check (service_rating between 1 and 5),
  unit_rating        smallint check (unit_rating between 1 and 5),
  cleanliness_rating smallint check (cleanliness_rating between 1 and 5),
  comment            text,
  categories         text[],
  created_at         timestamptz not null default now()
);

create index feedback_booking_idx on feedback (booking_id);

-- ---------------------------------------------------------------------------
-- game_requests + game_votes
-- ---------------------------------------------------------------------------
create table game_requests (
  request_id  text primary key
              default ('REQ-' || lpad(nextval('feedback_seq')::text, 3, '0')),
  game_name   text not null,
  status      request_status not null default 'REQUESTED',
  vote_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index game_requests_name_uniq on game_requests (lower(game_name));

create trigger game_requests_set_updated_at
  before update on game_requests
  for each row execute function public.set_updated_at();

create table game_votes (
  vote_id     bigserial primary key,
  request_id  text not null references game_requests (request_id) on delete cascade,
  voter_ref   text not null,
  created_at  timestamptz not null default now(),
  unique (request_id, voter_ref)
);

create index game_votes_request_idx on game_votes (request_id);

create or replace function public.sync_game_request_votes()
returns trigger
language plpgsql
as $$
begin
  update game_requests
     set vote_count = (select count(*) from game_votes v where v.request_id = coalesce(new.request_id, old.request_id))
   where request_id = coalesce(new.request_id, old.request_id);
  return null;
end;
$$;

create trigger game_votes_sync_count
  after insert or delete on game_votes
  for each row execute function public.sync_game_request_votes();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table audit_logs (
  id           bigserial primary key,
  actor_id     uuid references auth.users (id) on delete set null,
  actor_role   user_role,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  before_data  jsonb,
  after_data   jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id               bigserial primary key,
  recipient_type   notification_recipient not null,
  recipient_ref    text not null,
  channel          text not null default 'WHATSAPP',
  template         text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           notification_status not null default 'PENDING',
  sent_at          timestamptz,
  error            text,
  created_at       timestamptz not null default now()
);

create index notifications_status_idx on notifications (status, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table profiles             enable row level security;
alter table customers            enable row level security;
alter table bookings             enable row level security;
alter table booking_items        enable row level security;
alter table booking_extensions   enable row level security;
alter table payments             enable row level security;
alter table payment_events       enable row level security;
alter table unit_status_history  enable row level security;
alter table inventory_movements  enable row level security;
alter table feedback             enable row level security;
alter table game_requests        enable row level security;
alter table game_votes           enable row level security;
alter table audit_logs           enable row level security;
alter table notifications        enable row level security;

-- profiles: a signed-in user reads their own row only
create policy "profile self read" on profiles
  for select to authenticated
  using (user_id = auth.uid());

-- staff can read/write operations. Role check reads profiles, which is itself
-- protected, but the subquery runs as the caller and only matches own row.
create policy "staff manage customers" on customers
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

-- walk-in customers may be created by staff; online booking creation writes
-- through the service layer (service_role), not directly from the browser.
create policy "staff manage bookings" on bookings
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage booking_items" on booking_items
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage booking_extensions" on booking_extensions
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff read unit_status_history" on unit_status_history
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff write unit_status_history" on unit_status_history
  for insert to authenticated
  with check (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage inventory_movements" on inventory_movements
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

-- customer-facing writes go through the service layer. Game request/vote is
-- the one public write path (no login) and is insert-only.
create policy "public read game_requests" on game_requests
  for select to anon, authenticated using (true);
create policy "public create game_requests" on game_requests
  for insert to anon, authenticated with check (true);

create policy "public read game_votes" on game_votes
  for select to anon, authenticated using (true);
create policy "public create game_votes" on game_votes
  for insert to anon, authenticated with check (true);

-- admin-only reads
create policy "admin read audit_logs" on audit_logs
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN')
  ));

create policy "staff read notifications" on notifications
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = auth.uid() and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

-- payments, payment_events, audit_logs writes and all customer/booking reads
-- are service_role only (bypasses RLS). No policy = no anon/authenticated access.