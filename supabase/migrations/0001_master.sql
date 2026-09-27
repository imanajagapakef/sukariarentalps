-- =============================================================================
-- 0001_master.sql
-- Klub Sukaria — master data schema
-- Derived from sukaria_master_dataset_v0_1/seed.sql (v0.1)
-- =============================================================================

create extension if not exists moddatetime with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type data_status as enum ('SOURCE', 'DRAFT', 'RESEARCH', 'VERIFY');
create type branch_status as enum ('ACTIVE', 'INACTIVE');
create type facility_category as enum ('RENTAL', 'RACING', 'CONSOLE', 'VR');
create type unit_status as enum ('AVAILABLE', 'BOOKED', 'IN_USE', 'IN_ORDER', 'MAINTENANCE', 'OFFLINE');
create type unit_condition as enum ('GOOD', 'NEEDS_CLEANING', 'NEEDS_CHECK', 'DAMAGED');
create type pricing_type as enum ('HOURLY', 'PACKAGE');
create type promotion_status as enum ('DRAFT', 'ACTIVE', 'ENDED');
create type game_condition as enum ('AVAILABLE', 'NEEDS_VERIFICATION', 'MISSING');
create type snack_category as enum ('SNACK', 'DRINK', 'INSTANT_FOOD', 'COMBO');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- business
-- ---------------------------------------------------------------------------
create table businesses (
  business_id             text primary key,
  brand_name              text not null,
  business_type           text not null,
  city                    text not null,
  province                text not null,
  country                 text not null default 'Indonesia',
  timezone                text not null default 'Asia/Jakarta',
  operating_hours         text not null,
  instagram               text,
  website                 text,
  online_booking          boolean not null default false,
  online_payment_provider text,
  currency                text not null default 'IDR',
  data_status             data_status not null default 'DRAFT',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger businesses_set_updated_at
  before update on businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
create table branches (
  branch_id            text primary key,
  branch_code          text not null unique,
  name                 text not null,
  short_name           text not null,
  address              text not null,
  phone                text,
  operating_hours      text not null,
  google_rating        numeric(2,1),
  google_review_count  integer,
  status               branch_status not null default 'ACTIVE',
  data_status          data_status not null default 'DRAFT',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger branches_set_updated_at
  before update on branches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- facility_types (jenis tempat/unit, bukan unit individual)
-- ---------------------------------------------------------------------------
create table facility_types (
  facility_type_id  text primary key,
  code              text not null unique,
  name              text not null,
  platform          text not null,
  category          facility_category not null,
  data_status       data_status not null default 'DRAFT',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger facility_types_set_updated_at
  before update on facility_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- platforms (MISSING from v0.1 seed — game_platforms referenced PLAT-* with no
-- source table, which made the seed unrunnable)
-- ---------------------------------------------------------------------------
create table platforms (
  platform_id  text primary key,
  code         text not null unique,
  name         text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------
create table units (
  unit_id           text primary key,
  branch_id         text not null references branches (branch_id) on delete restrict,
  facility_type_id  text not null references facility_types (facility_type_id) on delete restrict,
  name              text not null,
  status            unit_status not null default 'AVAILABLE',
  condition         unit_condition not null default 'GOOD',
  data_status       data_status not null default 'DRAFT',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index units_branch_idx on units (branch_id);
create index units_status_idx on units (branch_id, status);

create trigger units_set_updated_at
  before update on units
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pricing_rules
-- ---------------------------------------------------------------------------
create table pricing_rules (
  pricing_id        text primary key,
  branch_id         text not null references branches (branch_id) on delete restrict,
  facility_type_id  text not null references facility_types (facility_type_id) on delete restrict,
  pricing_type      pricing_type not null,
  duration_minutes  integer not null check (duration_minutes > 0),
  price             integer not null check (price >= 0),
  source_date       date,
  data_status       data_status not null default 'DRAFT',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index pricing_rules_lookup_idx
  on pricing_rules (branch_id, facility_type_id, pricing_type, duration_minutes)
  where active;

create trigger pricing_rules_set_updated_at
  before update on pricing_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- promotions + items
-- ---------------------------------------------------------------------------
create table promotions (
  promotion_id  text primary key,
  branch_id     text not null references branches (branch_id) on delete restrict,
  name          text not null,
  description   text,
  status        promotion_status not null default 'DRAFT',
  source_date   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger promotions_set_updated_at
  before update on promotions
  for each row execute function public.set_updated_at();

create table promotion_items (
  promotion_id      text not null references promotions (promotion_id) on delete cascade,
  facility_type_id  text not null references facility_types (facility_type_id) on delete restrict,
  duration_minutes  integer not null check (duration_minutes > 0),
  price             integer not null check (price >= 0),
  primary key (promotion_id, facility_type_id, duration_minutes)
);

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table games (
  game_id          text primary key,
  name             text not null,
  slug             text not null unique,
  description      text,
  short_description text,
  developer        text,
  publisher        text,
  release_date     date,
  age_rating       text,
  research_status  text not null default 'RESEARCH_REQUIRED',
  active           boolean not null default true,
  data_status      data_status not null default 'DRAFT',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger games_set_updated_at
  before update on games
  for each row execute function public.set_updated_at();

create table game_platforms (
  game_platform_id     text primary key,
  game_id              text not null references games (game_id) on delete cascade,
  platform_id          text not null references platforms (platform_id) on delete restrict,
  version              text not null default 'STANDARD',
  verification_status  text not null default 'RESEARCH_REQUIRED',
  created_at           timestamptz not null default now(),
  unique (game_id, platform_id, version)
);

create table game_availability (
  game_availability_id  text primary key,
  game_id               text not null references games (game_id) on delete cascade,
  branch_id             text not null references branches (branch_id) on delete cascade,
  available             boolean not null default true,
  condition             game_condition not null default 'AVAILABLE',
  verification_status   text not null default 'SOURCE',
  created_at            timestamptz not null default now(),
  unique (game_id, branch_id)
);

create index game_availability_branch_idx on game_availability (branch_id) where available;

create table game_features (
  game_id              text primary key references games (game_id) on delete cascade,
  genre                text,
  local_multiplayer    boolean not null default false,
  online_multiplayer   boolean not null default false,
  co_op                boolean not null default false,
  competitive          boolean not null default false,
  single_player        boolean not null default false,
  max_local_players    integer,
  recommended_players  text,
  psvr2                boolean not null default false,
  research_status      text not null default 'RESEARCH_REQUIRED',
  updated_at           timestamptz not null default now()
);

create trigger game_features_set_updated_at
  before update on game_features
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- game_tags (filter "main 4 orang", co-op, dst)
-- ---------------------------------------------------------------------------
create table game_tags (
  tag_id   text primary key,
  code     text not null unique,
  name     text not null,
  category text
);

create table game_tag_map (
  game_id  text not null references games (game_id) on delete cascade,
  tag_id   text not null references game_tags (tag_id) on delete cascade,
  primary key (game_id, tag_id)
);

create index game_tag_map_tag_idx on game_tag_map (tag_id);

-- ---------------------------------------------------------------------------
-- snacks
-- ---------------------------------------------------------------------------
create table snacks (
  snack_id     text primary key,
  name         text not null,
  category     snack_category not null,
  price        integer not null check (price >= 0),
  stock        integer not null default 0,
  min_stock    integer not null default 0,
  active       boolean not null default true,
  data_status  data_status not null default 'DRAFT',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger snacks_set_updated_at
  before update on snacks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- booking_config (global default + optional per-branch override)
-- ---------------------------------------------------------------------------
create table booking_config (
  config_id                    text primary key,
  branch_id                    text references branches (branch_id) on delete cascade,
  minimum_duration_minutes     integer not null default 60 check (minimum_duration_minutes > 0),
  maximum_duration_minutes     integer not null default 360 check (maximum_duration_minutes >= minimum_duration_minutes),
  booking_interval_minutes     integer not null default 30 check (booking_interval_minutes > 0),
  cleaning_duration_minutes    integer not null default 10 check (cleaning_duration_minutes >= 0),
  payment_deadline_minutes     integer not null default 15 check (payment_deadline_minutes > 0),
  extension_interval_minutes   integer not null default 30 check (extension_interval_minutes > 0),
  minimum_extension_minutes    integer not null default 30 check (minimum_extension_minutes > 0),
  advance_booking_days         integer not null default 30 check (advance_booking_days > 0),
  late_tolerance_minutes       integer not null default 10 check (late_tolerance_minutes >= 0),
  data_status                  data_status not null default 'DRAFT',
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- exactly one global row (branch_id null) and at most one row per branch
create unique index booking_config_global_uniq
  on booking_config ((true)) where branch_id is null;
create unique index booking_config_branch_uniq
  on booking_config (branch_id) where branch_id is not null;

create trigger booking_config_set_updated_at
  before update on booking_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- data_sources (provenance / verification ledger)
-- ---------------------------------------------------------------------------
create table data_sources (
  source_id            text primary key,
  source_type          text not null,
  reference            text not null,
  source_date          text,
  verification_status  text not null default 'NEEDS_VERIFICATION',
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table businesses         enable row level security;
alter table branches           enable row level security;
alter table facility_types     enable row level security;
alter table platforms          enable row level security;
alter table units              enable row level security;
alter table pricing_rules      enable row level security;
alter table promotions         enable row level security;
alter table promotion_items    enable row level security;
alter table games              enable row level security;
alter table game_platforms     enable row level security;
alter table game_availability  enable row level security;
alter table game_features      enable row level security;
alter table game_tags          enable row level security;
alter table game_tag_map       enable row level security;
alter table snacks             enable row level security;
alter table booking_config     enable row level security;
alter table data_sources       enable row level security;

-- catalog + live availability are readable by anyone (customer booking flow)
create policy "public read" on businesses         for select to anon, authenticated using (true);
create policy "public read" on branches           for select to anon, authenticated using (true);
create policy "public read" on facility_types     for select to anon, authenticated using (true);
create policy "public read" on platforms          for select to anon, authenticated using (true);
create policy "public read" on units              for select to anon, authenticated using (true);
create policy "public read" on pricing_rules      for select to anon, authenticated using (true);
create policy "public read" on promotions         for select to anon, authenticated using (true);
create policy "public read" on promotion_items    for select to anon, authenticated using (true);
create policy "public read" on games              for select to anon, authenticated using (true);
create policy "public read" on game_platforms     for select to anon, authenticated using (true);
create policy "public read" on game_availability  for select to anon, authenticated using (true);
create policy "public read" on game_features      for select to anon, authenticated using (true);
create policy "public read" on game_tags          for select to anon, authenticated using (true);
create policy "public read" on game_tag_map       for select to anon, authenticated using (true);
create policy "public read" on snacks             for select to anon, authenticated using (true) ;
create policy "public read" on booking_config     for select to anon, authenticated using (true);

-- data_sources stays internal: only service_role (bypasses RLS) may access.

-- ---------------------------------------------------------------------------
-- Harden default Supabase helper leaked to anon/authenticated
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
exception
  when undefined_function then null;
end $$;