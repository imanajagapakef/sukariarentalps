-- =============================================================================
-- 0025_mark_unit_ready_from_offline.sql
--
-- OFFLINE jadi jalan buntu: unit yang di-set offline tidak bisa dikembalikan
-- ke AVAILABLE. Ketahuan dari symptom "unit B5-R06 tidak bisa ditandai siap
-- dari status OFFLINE", dan ternyata bukan satu unit: di database ada 8 unit
-- Batu 5 yang tersangkut OFFLINE, sehingga lounge tampil hampir habis.
--
-- Penyebabnya bukan UI. src/components/admin/unit-actions.tsx sengaja
-- menampilkan tombol "Set Ready" untuk status OFFLINE, dan copy di
-- /admin/units menjanjikan "aktifkan lagi setelah siap". Yang menolak
-- adalah mark_unit_ready() dari 0007, yang hanya menerima IN_ORDER dan
-- MAINTENANCE sebagai status asal. Jadi tombolnya ada, aktif, dan selalu
-- gagal dengan 22023.
--
-- Diperparah oleh arah transisinya: endpoint /api/admin/units/status meneruskan
-- setiap permintaan AVAILABLE ke RPC ini, dan zod hanya mengizinkan
-- MAINTENANCE/OFFLINE/AVAILABLE. Tidak ada jalur lain keluar dari OFFLINE,
-- selain memaksa lewat MAINTENANCE lebih dulu.
--
-- Perbaikannya di sini, bukan di route handler: guard dari-status adalah
-- urusan database, dan melonggarkan RPC sekaligus memperbaiki semua pemanggil
-- (admin units, alur cleaning setelah booking selesai, dan skrip apa pun yang
-- memanggil RPC ini) tanpa kode aplikasi yang berubah.
--
-- Yang sengaja TIDAK dilonggarkan: BOOKED, IN_USE, dan AVAILABLE. Menyetrika
-- unit yang sedang dipesan atau sedang dipakai harus tetap ditolak, dan itu
-- masalah yang lebih serius daripada unit tersangkut: mengembalikan unit yang
-- masih punya booking aktif berarti unit itu bisa dipesan dua kali.
--
-- create or replace mempertahankan ACL, jadi grant service_role dari 0007
-- tetap berlaku. Blok grant di bawah sengaja diulang agar migrasi ini berdiri
-- sendiri kalau nanti dijalankan di database yang belum lewat 0007.
--
-- Tidak ada baris yang diperbaiki otomatis di sini: unit yang sekarang OFFLINE
-- belum tentu benar-benar rusak, dan status itu keputusan staff. Setelah
-- migrasi ini, mereka bisa mengembalikan sendiri lewat tombol yang sudah ada -
-- persis yang gagal tadi.
-- =============================================================================

create or replace function public.mark_unit_ready(p_unit_id text)
returns unit_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from unit_status;
begin
  select status into v_from from units where unit_id = p_unit_id for update;
  if v_from is null then
    raise exception 'unit % tidak ditemukan', p_unit_id using errcode = '22023';
  end if;
  -- OFFLINE ditambahkan di 0025: status itu out-of-service yang bisa dipulihkan
  -- staff, sama seperti MAINTENANCE, dan UI sudah menjanjikannya.
  if v_from not in ('IN_ORDER', 'MAINTENANCE', 'OFFLINE') then
    raise exception 'unit % tidak bisa ditandai siap dari status %', p_unit_id, v_from using errcode = '22023';
  end if;

  update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = p_unit_id;
  insert into unit_status_history (unit_id, from_status, to_status, reason)
  values (p_unit_id, v_from, 'AVAILABLE', 'unit siap');

  return 'AVAILABLE';
end;
$$;

revoke execute on function public.mark_unit_ready(text) from anon, authenticated, public;
grant execute on function public.mark_unit_ready(text) to service_role;