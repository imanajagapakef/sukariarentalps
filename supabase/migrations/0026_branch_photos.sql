-- =============================================================================
-- 0026_branch_photos.sql
--
-- Satu slot foto per cabang. Sebelumnya branches cuma punya satu kolom
-- image_url yang praktis menganggur: getBranches() mengambilnya tapi tidak ada
-- halaman yang merendernya, dan hero halaman cabang malah memakai foto unit
-- (`units.find(u => u.image_url)`), jadi gambar besarnya asal saja bukan foto
-- cabangnya. Staff juga tidak punya panel admin untuk cabang sama sekali.
--
-- Dipilih tabel terpisah, bukan kolom text[] di branches:
--   - foreign key ke branches, jadi foto tidak bisa yatim saat cabang dihapus
--   - satu foto = satu baris, jadi caption dan urutan punya tempat sendiri
--   - RLS applied per tabel seperti tabel katalog lain
--
-- Urutan pakai `position` lalu photo_id sebagai pemutus seri. Dua aksi, dan
-- keduanya cukup satu baris:
--   - upload baru  -> position = max + 1, jadi masuk ke paling akhir
--   - jadikan utama -> position = min - 1, jadi pindah ke depan tanpa perlu
--     menomori ulang seluruh galeri
--
-- Batas 8 foto per cabang ditegakkan di trigger, bukan hanya di route handler.
-- Kolom `status` dan `branch_id` pada branches dabei tidak berubah: galeri ini
-- tambahan tampilan, bukan pengganti data cabang.
-- =============================================================================

create table if not exists public.branch_photos (
  photo_id   bigserial primary key,
  branch_id  text not null references public.branches (branch_id) on delete cascade,
  image_url  text not null check (char_length(image_url) between 1 and 600),
  caption    text check (caption is null or char_length(caption) <= 140),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

-- The read path is always "this branch's photos, in order". A unique index on
-- (branch_id, position) would fight the move-to-front action above, which is
-- deliberately free to reuse a position, so ordering is left to the query.
create index if not exists branch_photos_branch_order
  on public.branch_photos (branch_id, position, photo_id);

alter table public.branch_photos enable row level security;

drop policy if exists "public read" on public.branch_photos;
create policy "public read" on public.branch_photos
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Maximum 8 photos per branch, enforced here so no caller can route around it.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_branch_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.branch_photos where branch_id = new.branch_id) >= 8 then
    raise exception 'cabang % sudah punya 8 foto (maksimum)', new.branch_id using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists branch_photos_limit on public.branch_photos;
create trigger branch_photos_limit
  before insert on public.branch_photos
  for each row
  execute function public.enforce_branch_photo_limit();

revoke execute on function public.enforce_branch_photo_limit() from anon, authenticated, public;