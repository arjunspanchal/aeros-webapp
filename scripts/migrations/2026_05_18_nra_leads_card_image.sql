-- Persist the photographed business card alongside the extracted data.
-- The image lives in Supabase Storage; only the public URL is on the row.
-- Bucket is public-read with unguessable UUID paths — same convention as
-- catalog-photos and clearance-photos.

alter table public.nra_leads
  add column card_image_url text not null default '';

-- Public bucket. Paths are crypto.randomUUID() so listing is effectively
-- impossible. The URL never reaches an end user — admin-only GET on
-- /api/nra/leads returns it, admin-only UI displays it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nra-card-images',
  'nra-card-images',
  true,
  10485760,  -- 10 MB hard cap
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
