-- Staff dieline tool: brand kits — 2026-11-21 (branch feat/dieline-staff)
--
-- One row = one customer / brand: its vector logos (SVG text, with the Pantone name on every colour) and its colours,
-- saved once and dropped onto any cup, bag or box. Vector only - pictures are not kept (free-plan quota; a logo that is
-- only a picture is traced to vector in the tool first). Nothing goes to Supabase Storage.
-- Server-side access only (service role); RLS on with no policies, like dieline_designs.

create table if not exists dieline_brand_kits (
  id          uuid primary key default gen_random_uuid(),
  customer    text not null,                        -- customer / brand, as typed on the design
  logos       jsonb not null default '[]'::jsonb,   -- [{ key, name, w, h, natW, natH, svgText, colours, ... }]
  logo_names  jsonb not null default '[]'::jsonb,   -- names only, for the list (the logos themselves load on demand)
  colours     jsonb not null default '[]'::jsonb,   -- [{ hex, name }]
  archived    boolean not null default false,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists dieline_brand_kits_customer_idx on dieline_brand_kits (lower(customer)) where not archived;

alter table dieline_brand_kits enable row level security;
