-- =============================================================================
-- 0022_public_realtime_broadcast.sql
--
-- Broadcast channel supaya kasir menekan "Konfirmasi" langsung terlihat oleh
-- pelanggan, tanpa menunggu polling 8 detik.
--
-- Kenapa butuh migration: realtime.messages punya RLS aktif tapi tanpa policy
-- (hasil probe: subscribe SUBSCRIBED, send "ok", payload tidak pernah sampai).
-- Semua pesan broadcast masuk ke tabel itu, jadi tanpa policy SELECT tidak ada
-- yang bisa menerima — termasuk broadcast yang kita kirim sendiri.
--
-- Ini adalah policy "public channel" standar Supabase. Konsekuensinya: siapa pun
-- dengan publishable key bisa broadcast ke channel mana pun di project ini.
-- Batas dampaknya sengaja dibuat kecil di sisi klien:
--   - LiveBooking memakai payload hanya sebagai isyarat untuk memanggil
--     router.refresh(), jadi data selalu dibaca ulang dari server. Isi payload
--     tidak pernah dipercaya, jadi broadcast palsu tidak bisa mengubah state.
--   - Kode booking sudah jadi kuncilookup publik di /tiket/[code], jadi channel
--     booking:{code} tidak membuka data yang belum bisa diakses orang lain.
-- Kalau project ini dulu butuh private channel (mis. presence internal), policy
-- ini yang perlu dipersempit — bukan dihapus.
-- =============================================================================

create policy "public channels are readable"
  on realtime.messages for select
  to anon, authenticated
  using (true);

create policy "public channels are broadcastable"
  on realtime.messages for insert
  to anon, authenticated
  with check (true);