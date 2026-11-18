-- =============================================================================
-- 0042_slot_availability_public_grant.sql
--
-- /api/slots memakai client publik (anon) + cache pendek, bukan service-role.
-- Tapi slot_availability() adalah SECURITY DEFINER dan migrasi 0035 mencabut
-- EXECUTE-nya dari anon (ia tidak ada di whitelist RPC publik), jadi pemanggilan
-- dari client publik akan gagal.
--
-- Grant ini mengikuti pola yang sama dengan whitelist di 0035: fungsi yang
-- hanya membaca data yang memang sudah ditampilkan publik (grid ketersediaan
-- per unit) di-publish ke anon; search_path dipatet; fungsi tetap
-- SECURITY DEFINER supaya RLS unit_reservations ("service only") tidak
-- memblokir pembacaannya.
--
-- Yang TIDAK dipublish: seluruh fungsi booking, pembayaran, dan pelanggan.
-- =============================================================================

-- search_path dipatet (best practice Supabase: avoid mutable search_path).
alter function public.slot_availability(text, text, date, integer)
  set search_path = public, extensions;

grant execute on function public.slot_availability(text, text, date, integer)
  to anon, authenticated;

-- Konfirmasi grant-nya (idempotent).
do $$
begin
  if not has_function_privilege('anon', 'public.slot_availability(text,text,date,integer)', 'execute') then
    raise exception 'grant slot_availability ke anon gagal';
  end if;
end;
$$;
