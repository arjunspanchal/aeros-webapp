-- Lead capture from trade shows. First populated at NRA 2026 (Booth #12937,
-- McCormick Place Chicago, 16-19 May 2026). The `show` column lets the same
-- table host future shows without a fresh migration.
--
-- Access model: RLS is ON with NO policies. Anon and authenticated roles get
-- zero access. The only reader/writer is server-side code using the
-- service-role key (bypasses RLS), reached via /api/nra/leads.

create table public.nra_leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null,
  company     text not null,
  role        text not null default '',
  email       text not null,
  phone       text not null default '',
  category    text not null default '',
  booth       text not null default '',
  interests   text[] not null default '{}',
  notes       text not null default '',
  source      text not null check (source in ('self','owner')),
  show        text not null default 'nra-2026'
);

create index nra_leads_created_at_idx on public.nra_leads (created_at desc);
create index nra_leads_show_idx       on public.nra_leads (show);

alter table public.nra_leads enable row level security;

-- updated_at trigger
create or replace function public.nra_leads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nra_leads_updated_at
  before update on public.nra_leads
  for each row execute function public.nra_leads_set_updated_at();
