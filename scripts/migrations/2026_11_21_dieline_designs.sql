-- Staff dieline tool: saved designs — 2026-11-21 (branch feat/dieline-staff)
--
-- One row = one saved job from /design/dieline/staff: the RECIPE (template + sizes + material + print), which rebuilds
-- the identical die by maths, plus the ARTWORK placement (items in millimetres on the flat die). No files are stored:
-- vector logos are kept as SVG text inside `artwork`; raster images are kept only when small (the app caps them) and
-- otherwise saved as a placeholder that asks for the file again. Nothing goes to Supabase Storage.
-- Server-side access only (service role); RLS on with no policies, like the other internal tables.

create table if not exists dieline_designs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  customer    text,                 -- customer / brand, free text
  job_ref     text,                 -- FactoryOS job number or other reference, free text
  template    text not null,        -- template id, e.g. 'sos-handmade'
  recipe      jsonb not null,       -- { template, values, construction, board, print, engineVersion }
  artwork     jsonb not null default '[]'::jsonb,  -- placed items
  checks_ok   boolean not null default false,      -- every die + artwork check passed at save time
  archived    boolean not null default false,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dieline_designs_recent_idx on dieline_designs (archived, updated_at desc);
create index if not exists dieline_designs_customer_idx on dieline_designs (lower(customer));

alter table dieline_designs enable row level security;
