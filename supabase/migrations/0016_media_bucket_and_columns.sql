-- Media pipeline: a public bucket for catalogue imagery, and image columns.
--
-- Why: games, snacks, units and branches had no image column at all, so every
-- card in the app fell back to Cover's gradient swatch. This adds the storage
-- target and the columns; Slice 6 seeds the files and the admin upload UI
-- writes through them.
--
-- Object key convention, so a row's assets are easy to list and replace:
--   games/<game_id>/<filename>
--   snacks/<snack_id>/<filename>
--   units/<unit_id>/<filename>
--   branches/<branch_id>/<filename>
--
-- The bucket is public-read: covers render on customer-facing pages that are
-- not authenticated. Writes are limited to the same roles that already manage
-- catalogue data (OWNER/ADMIN/STAFF), mirroring the `customers` policy, and
-- anon gets no write access at all.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  5242880, -- 5 MB: plenty for a webp cover, blocks accidental video uploads
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- anon and authenticated both read: the catalogue is public.
drop policy if exists "media public read" on storage.objects;
create policy "media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

-- Staff roles only, resolved from the profiles table exactly like the
-- catalogue policies do. No anon path can upload.
drop policy if exists "media staff insert" on storage.objects;
create policy "media staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid() and p.active
         and p.role in ('OWNER', 'ADMIN', 'STAFF')
    )
  );

drop policy if exists "media staff update" on storage.objects;
create policy "media staff update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid() and p.active
         and p.role in ('OWNER', 'ADMIN', 'STAFF')
    )
  )
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid() and p.active
         and p.role in ('OWNER', 'ADMIN', 'STAFF')
    )
  );

drop policy if exists "media staff delete" on storage.objects;
create policy "media staff delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid() and p.active
         and p.role in ('OWNER', 'ADMIN', 'STAFF')
    )
  );

-- Columns. Nullable with no default: an absent image is a normal state and must
-- keep rendering the gradient fallback, not become an error.
alter table public.games    add column if not exists image_url text;
alter table public.snacks   add column if not exists image_url text;
alter table public.units    add column if not exists image_url text;
alter table public.branches add column if not exists image_url text;

comment on column public.games.image_url    is 'Public URL in the media bucket, e.g. games/GM-001/cover.webp';
comment on column public.snacks.image_url   is 'Public URL in the media bucket, e.g. snacks/SNK-001/popcorn.webp';
comment on column public.units.image_url    is 'Public URL in the media bucket, e.g. units/GN-V02/booth.webp';
comment on column public.branches.image_url is 'Public URL in the media bucket, e.g. branches/BR-B5/lounge.webp';
