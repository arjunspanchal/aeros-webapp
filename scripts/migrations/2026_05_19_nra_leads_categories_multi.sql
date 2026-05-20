-- Flip "What they do" from single-select to multi-select. A lead can fit
-- more than one bucket — e.g. a Boba Drink Distributor is both Distributor
-- and Beverage. Existing single-value strings convert to single-element
-- arrays; empty strings become empty arrays.

alter table public.nra_leads
  rename column category to categories;

alter table public.nra_leads
  alter column categories drop default;

alter table public.nra_leads
  alter column categories type text[]
  using (case
    when categories is null or categories = '' then '{}'::text[]
    else array[categories]::text[]
  end);

alter table public.nra_leads
  alter column categories set default '{}';

alter table public.nra_leads
  alter column categories set not null;

-- GIN supports `categories @> ARRAY['X']` and `'X' = ANY(categories)`,
-- which is what filter-by-category queries will use post-show.
create index if not exists nra_leads_categories_gin_idx
  on public.nra_leads using gin (categories);
