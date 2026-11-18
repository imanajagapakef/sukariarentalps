-- =============================================================================
-- 0044_admin_realtime.sql
--
-- Admin harus melihat data terbaru tanpa me-refresh: booking baru, perubahan
-- status, dan bukti bayar yang baru diunggah.
--
-- Supabase Realtime `postgres_changes` menghormati RLS: sebuah event hanya
-- dikirim ke klien yang boleh membaca baris itu. Karena itu:
--   - `bookings` sudah punya policy "staff manage bookings" untuk authenticated,
--     jadi staf mendapat event tanpa perubahan policy.
--   - `payment_proofs` belum punya policy apa pun (SELECT tertutup), jadi staf
--     TIDAK akan menerima event sampai policy SELECT untuk staf ditambahkan.
--   - Keduanya belum ada di publication, jadi harus ditambahkan.
--
-- Yang TIDAK dibuka: anon tetap tidak bisa membaca bookings/payment_proofs.
-- Policy baru ini hanya untuk `authenticated`, dan hanya baris yang lolos
-- pemeriksaan profil aktif dengan role staf.
-- =============================================================================

-- 1) Staf boleh membaca bukti bayar (dipakai /admin/bookings, dan realtime).
drop policy if exists "staff read payment proofs" on public.payment_proofs;
create policy "staff read payment proofs" on public.payment_proofs
  for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.user_id = (select auth.uid())
       and p.active
       and p.role in ('OWNER', 'ADMIN', 'STAFF')
  ));

-- 2) Tambahkan tabel ke publication realtime (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_proofs'
  ) then
    alter publication supabase_realtime add table public.payment_proofs;
  end if;
end $$;

-- 3) REPLICA IDENTITY FULL: Supabase Realtime mengevaluasi RLS terhadap baris
--    LAMA pada UPDATE/DELETE. Dengan identity default (primary key saja), kolom
--    yang dipakai policy (mis. branch/role) tidak ikut terkirim sehingga event
--    bisa di-drop. Booking punya UPDATE (status berubah) dan proof jarang
--    dihapus, jadi keduanya perlu FULL.
alter table public.bookings replica identity full;
alter table public.payment_proofs replica identity full;
