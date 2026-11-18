-- =============================================================================
-- 0047_extension_proofs.sql
--
-- Bukti bayar perpanjangan.
--
-- Sebelumnya semua pembayaran perpanjangan diselesaikan di kasir saat
-- check-out. Pelanggan yang ingin menambah jam lewat QRIS (mis. saat belum
-- mulai main dan tidak mau datang ke kasir) perlu bisa mengunggah bukti untuk
-- pembayaran extension itu. payment_proofs sudah punya dua pemilik
-- (booking_id, tournament_registration_id), jadi extension_id mengikuti pola
-- yang sama; booking_id tetap diisi supaya bukti tetap tampil di baris booking
-- yang sama pada layar kasir.
-- =============================================================================

alter table public.payment_proofs
  add column if not exists extension_id text
    references public.booking_extensions (extension_id) on delete cascade;

create index if not exists payment_proofs_extension_idx
  on public.payment_proofs (extension_id)
  where extension_id is not null;