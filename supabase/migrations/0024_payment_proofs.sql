-- =============================================================================
-- 0024_payment_proofs.sql
--
-- Bukti transfer yang diunggah pelanggan, supaya kasir tidak perlu menebak
-- nominal yang dikirim dan ada jejak-paper kalau ada sengketa.
--
-- Bucket PRIVAT, bukan `media`. Yang public itu aman untuk cover katalog, tapi
-- screenshot mutasi memuat nomor rekening, nama pemilik, dan saldo. Layan ke
-- staff lewat signed URL berumur pendek, bukan URL publik yang bisa ditebak.
--
-- INSERT juga tidak dibuka ke anon/authenticated: unggahan lewat API route yang
-- memakai service role, supaya bucket ini tidak jadi tempat.upload terbuka.
--
-- Catatan yang harus dibaca kasir: bukti ini klaim pelanggan, bukan bukti
-- pembayaran. Nominal di sini bisa salah atau dipalsukan; yang menentukan tetap
-- mutasi rekening klub. UI/admin sengaja menampilkan nominal klaim
-- berdampingan dengan total tagihan supaya selisihnya kelihatan.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 3145728,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Tidak ada policy storage.objects untuk bucket ini: objeknya hanya dibaca lewat
-- signed URL yang dibuat service role. Policy SELECT yang sudah ada
-- ('media public read') sudah dibatasi ke bucket_id = 'media'.

create table payment_proofs (
  proof_id    bigserial primary key,
  booking_id  text not null references bookings (booking_id) on delete cascade,
  nominal     integer not null check (nominal > 0),
  note        text check (note is null or char_length(note) <= 200),
  object_path text not null,
  created_at  timestamptz not null default now()
);

create index payment_proofs_booking_created_idx
  on payment_proofs (booking_id, created_at desc);

alter table payment_proofs enable row level security;