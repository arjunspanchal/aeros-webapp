-- Calculator v2 rate book overrides.
--
-- lib/quote-engine/rates/defaults.js is the seed and the record of where each
-- rate came from. A row here overrides one key at runtime, so a rate can be
-- changed from /calculator/v2/rates without a code deploy. No row = the default.
-- Paper ₹/kg stays in master_papers.
create table if not exists public.calc_rates (
  key         text primary key,
  value       numeric not null,
  status      text not null default 'confirmed' check (status in ('confirmed', 'assumed', 'disputed')),
  source      text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

comment on table public.calc_rates is
  'Calculator v2 rate overrides, keyed like lib/quote-engine/rates/defaults.js. Server-side only.';

-- Read and written only through the app server (service role). No policies on purpose.
alter table public.calc_rates enable row level security;
