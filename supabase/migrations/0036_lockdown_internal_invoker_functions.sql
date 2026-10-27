
-- =============================================================
-- 0036_lockdown_internal_invoker_functions
-- Tujuan:
--   1) REVOKE EXECUTE dari PUBLIC/anon/authenticated utk 5 fungsi
--      INVOKER internal (tidak dipanggil via RPC dari app; invocation
--      trigger/internal-SD berjalan sebagai owner = butuh no priv).
--   2) Pin search_path utk round_to_interval (temuan advisor: search path mutable).
-- =============================================================

-- STEP 1: reversibility-friendly hard revoke (_safe privileges):
REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_booking_code()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_registration_code()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tournament_seed_order(p_size integer)          FROM PUBLIC, anon, authenticated;

-- STEP 2: pin search_path agar tidak mutable & compatible dengan Supabase recommended linters
ALTER FUNCTION public.round_to_interval(p_at timestamp with time zone, p_interval integer)
  SET search_path = public, extensions;
