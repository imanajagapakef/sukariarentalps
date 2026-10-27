-- 0037: Harden code generators (crypto-grade randomness) + enforce one live payment per booking
--
-- 1) generate_booking_code / generate_registration_code:
--    - replace random() (non-crypto PRNG, predictable) with extensions.gen_random_bytes (pgcrypto)
--    - unbiased mapping: alphabet has exactly 32 chars -> 5 fair bits per character
--      (get_bit, MSB-first), 6 chars = 30 of the 64 bits of 8 random bytes
--    - signature (text, no args), prefixes 'SR-'/'TRN-', VOLATILE, INVOKER,
--      and existing EXECUTE grants are preserved
-- 2) Partial unique index: at most one live (PENDING/PAID) payment per booking.
--    FAILED rows (retry history) and walk-in PAID-at-create flows stay valid;
--    a second concurrent 'start payment' insert fails fast with 23505.

CREATE OR REPLACE FUNCTION public.generate_booking_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_buffer    bytea;
  v_result    text := 'SR-';
  v_char_val  integer;
  v_i         integer;
  v_k         integer;
  c_alphabet  CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- exactly 32 chars
BEGIN
  v_buffer := extensions.gen_random_bytes(8);
  FOR v_i IN 0..5 LOOP
    v_char_val := 0;
    FOR v_k IN 0..4 LOOP
      IF get_bit(v_buffer, v_i * 5 + v_k) = 1 THEN
        v_char_val := v_char_val | (1 << (4 - v_k));
      END IF;
    END LOOP;
    v_result := v_result || substr(c_alphabet, v_char_val + 1, 1);
  END LOOP;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_registration_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_buffer    bytea;
  v_result    text := 'TRN-';
  v_char_val  integer;
  v_i         integer;
  v_k         integer;
  c_alphabet  CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- exactly 32 chars
BEGIN
  v_buffer := extensions.gen_random_bytes(8);
  FOR v_i IN 0..5 LOOP
    v_char_val := 0;
    FOR v_k IN 0..4 LOOP
      IF get_bit(v_buffer, v_i * 5 + v_k) = 1 THEN
        v_char_val := v_char_val | (1 << (4 - v_k));
      END IF;
    END LOOP;
    v_result := v_result || substr(c_alphabet, v_char_val + 1, 1);
  END LOOP;
  RETURN v_result;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_booking_live_unique_idx
  ON public.payments (booking_id)
  WHERE booking_id IS NOT NULL
    AND status IN ('PENDING', 'PAID');
