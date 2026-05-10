-- Sample Kits — predefined groupings (e.g. "PET Cup Sample Kit") that
-- appear as ONE line item on a sample dispatch. Components describe
-- what's physically inside the kit (warehouse packing reference) and
-- are NOT individually listed on the dispatch PDF.

create table if not exists public.sample_kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_price numeric(12,2),
  default_gst_pct numeric(5,2) not null default 18,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz,
  unique (name)
);

create index if not exists sample_kits_active_idx
  on public.sample_kits (active, name)
  where deleted_at is null;

create table if not exists public.sample_kit_components (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.sample_kits(id) on delete cascade,
  master_product_id uuid references public.master_products(id) on delete set null,
  description text not null,
  quantity_per_kit numeric(12,2) not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sample_kit_components_kit_idx
  on public.sample_kit_components (kit_id, sort_order);

create or replace function public.touch_sample_kit_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_sample_kit_updated_at on public.sample_kits;
create trigger trg_sample_kit_updated_at
before update on public.sample_kits
for each row execute function public.touch_sample_kit_updated_at();

-- Backreference: when a dispatch line was added from a kit, point at it.
-- Description / price are still copied onto the dispatch line so future
-- kit edits don't rewrite historical records.
alter table public.sample_dispatch_items
  add column if not exists sample_kit_id uuid
  references public.sample_kits(id) on delete set null;

create index if not exists sample_dispatch_items_kit_idx
  on public.sample_dispatch_items (sample_kit_id)
  where sample_kit_id is not null;

alter table public.sample_kits enable row level security;
alter table public.sample_kit_components enable row level security;
