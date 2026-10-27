
-- =====================================================================
-- Migration 0035: restrict EXECUTE on SECURITY DEFINER functions
-- =====================================================================
-- Background: 19 SECURITY DEFINER (SD) functions in schema public were
-- still callable by anon/authenticated after the 0004/0007 hardening pass
-- (new functions created in 0029/0030/0031 never had explicit REVOKEs).
--
-- Public RPC surface that MUST stay reachable with the anon key:
--   SECURITY DEFINER:
--     public_tournament_overview(text)      -> src/lib/tournaments.ts (ISR page)
--   SECURITY INVOKER (never privileged, but same publish surface):
--     calculate_price(text, text, integer)  -> src/components/booking-form.tsx
--     get_booking_config(text)              -> src/components/booking-form.tsx
--     get_available_units(text, tstz, tstz)
--     latest_extendable(text)
--     next_available(text, tstz)            -> unit pages
--     next_available_batch(text[], tstz)
--     next_available_by_branch(text, tstz)
--     promo_offerings()                     -> src/lib/catalog.ts
--
-- Everything else SD = internal only (service_role via createAdminClient,
-- triggers, other SD functions, pg_cron). Trigger execution and internal
-- SD-to-SD calls run as the function owner and DO NOT check EXECUTE
-- privileges, so revoking them is safe by design.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1 (MUST run first): GRANT service_role EXECUTE on ALL functions
-- in schema public. service_role currently receives EXECUTE via PUBLIC;
-- STEP 2 revokes from PUBLIC would strip it, so grant explicitly now.
-- ---------------------------------------------------------------------
DO $block$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           n.nspname,
           pg_get_function_identity_arguments(p.oid) AS fargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      r.nspname, r.proname, r.fargs
    );
  END LOOP;
END
$block$;

-- ---------------------------------------------------------------------
-- STEP 2: REVOKE EXECUTE from public, anon, authenticated for every
-- SECURITY DEFINER function EXCEPT the published whitelist above.
-- ---------------------------------------------------------------------
DO $block$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           n.nspname,
           pg_get_function_identity_arguments(p.oid) AS fargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true
      AND p.proname <> 'public_tournament_overview'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM public, anon, authenticated',
      r.nspname, r.proname, r.fargs
    );
  END LOOP;
END
$block$;

-- ---------------------------------------------------------------------
-- STEP 3: explicit grants for the published SECURITY DEFINER whitelist
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.public_tournament_overview(text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- STEP 4: defensive explicit grants for the published SECURITY INVOKER
-- RPCs (annon callable surface, documented + idempotent)
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.calculate_price(text, text, integer)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_config(text)                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_units(text, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.latest_extendable(text)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_available(text, timestamptz)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_available_batch(text[], timestamptz)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_available_by_branch(text, timestamptz)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_offerings()                             TO anon, authenticated;

-- ---------------------------------------------------------------------
-- STEP 5: default privileges -- future functions created by role
-- postgres in schema public start CLOSED to public/anon/authenticated.
-- IMPORTANT for future migrations: any new (or DROP+CREATE re-created)
-- function that belongs on the public surface MUST be granted explicitly
-- right after creation (STEP 3/4 pattern; STEP 1 pattern for service_role).
-- ---------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM public, anon, authenticated;
