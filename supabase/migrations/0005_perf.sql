-- =============================================================================
-- 0005_perf.sql
-- - call auth.uid() once per query, not per row (advisor 0003)
-- - cover foreign keys with indexes (advisor 0001)
-- unused_index (0005) is intentionally ignored: this database has no traffic
-- yet, so every index is "unused" by definition.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RLS: wrap auth.uid() in a scalar subquery
-- ---------------------------------------------------------------------------
drop policy "profile self read" on profiles;
create policy "profile self read" on profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  t text;
  tables text[] := array[
    'customers', 'bookings', 'booking_items', 'booking_extensions',
    'unit_status_history', 'inventory_movements', 'audit_logs', 'notifications'
  ];
  pol record;
begin
  for t in select unnest(tables) loop
    for pol in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = t
    loop
      -- rebuild each staff policy with the initplan-safe form
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy "staff manage customers" on customers
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage bookings" on bookings
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage booking_items" on booking_items
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage booking_extensions" on booking_extensions
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff read unit_status_history" on unit_status_history
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff write unit_status_history" on unit_status_history
  for insert to authenticated
  with check (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "staff manage inventory_movements" on inventory_movements
  for all to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ))
  with check (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

create policy "admin read audit_logs" on audit_logs
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN')
  ));

create policy "staff read notifications" on notifications
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.user_id = (select auth.uid()) and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

-- ---------------------------------------------------------------------------
-- Covering indexes for foreign keys
-- ---------------------------------------------------------------------------
create index if not exists units_facility_type_idx            on units (facility_type_id);
create index if not exists pricing_rules_facility_type_idx    on pricing_rules (facility_type_id);
create index if not exists promotions_branch_idx              on promotions (branch_id);
create index if not exists promotion_items_facility_type_idx  on promotion_items (facility_type_id);
create index if not exists game_platforms_platform_idx        on game_platforms (platform_id);
create index if not exists bookings_created_by_idx            on bookings (created_by);
create index if not exists bookings_game_idx                  on bookings (game_id);
create index if not exists booking_items_snack_idx            on booking_items (snack_id);
create index if not exists booking_extensions_requested_by_idx on booking_extensions (requested_by);
create index if not exists payment_events_payment_idx         on payment_events (payment_id);
create index if not exists feedback_customer_idx              on feedback (customer_id);
create index if not exists inventory_movements_booking_idx    on inventory_movements (booking_id);
create index if not exists inventory_movements_actor_idx      on inventory_movements (actor_id);
create index if not exists unit_status_history_booking_idx    on unit_status_history (booking_id);
create index if not exists unit_status_history_actor_idx      on unit_status_history (actor_id);
create index if not exists audit_logs_actor_idx               on audit_logs (actor_id);