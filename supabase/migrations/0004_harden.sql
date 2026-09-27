-- =============================================================================
-- 0004_harden.sql
-- - pin search_path on every function (advisor 0011)
-- - explicit deny-all policies on service-role-only tables (advisor 0008)
-- =============================================================================

alter function public.set_updated_at()                set search_path = public;
alter function public.generate_booking_code()         set search_path = public;
alter function public.apply_inventory_movement()      set search_path = public, extensions;
alter function public.sync_game_request_votes()       set search_path = public;
alter function public.get_booking_config(text)        set search_path = public;
alter function public.get_available_units(text, timestamptz, timestamptz) set search_path = public, extensions;
alter function public.next_available(text, timestamptz) set search_path = public, extensions;
alter function public.latest_extendable(text)         set search_path = public, extensions;
alter function public.calculate_price(text, text, integer) set search_path = public;

-- service-role-only tables: make the denial explicit instead of relying on
-- "RLS on + zero policies". Nothing changes at runtime (service_role bypasses
-- RLS either way), but the intent is now readable in the schema.
create policy "service only" on public.data_sources
  for all to anon, authenticated using (false) with check (false);
create policy "service only" on public.feedback
  for all to anon, authenticated using (false) with check (false);
create policy "service only" on public.payments
  for all to anon, authenticated using (false) with check (false);
create policy "service only" on public.payment_events
  for all to anon, authenticated using (false) with check (false);
create policy "service only" on public.unit_reservations
  for all to anon, authenticated using (false) with check (false);