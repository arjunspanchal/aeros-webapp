-- A business card can have two sides — front for the contact, back for
-- address / second contact / translation. Promote card_image_url to an
-- array so a single lead can carry both photos. Existing single-string
-- values become single-element arrays.

alter table public.nra_leads
  rename column card_image_url to card_image_urls;

alter table public.nra_leads
  alter column card_image_urls drop default;

alter table public.nra_leads
  alter column card_image_urls type text[]
  using (case
    when card_image_urls is null or card_image_urls = '' then '{}'::text[]
    else array[card_image_urls]::text[]
  end);

alter table public.nra_leads
  alter column card_image_urls set default '{}';

alter table public.nra_leads
  alter column card_image_urls set not null;
