-- Floor-walking added a few asks: classify the lead (exhibitor vs visitor),
-- flag follow-up priority, and stamp the country derived from the phone
-- number's calling code. All default to neutral values so existing rows
-- backfill cleanly.

alter table public.nra_leads
  add column record_type text not null default 'exhibitor'
    check (record_type in ('exhibitor', 'visitor')),
  add column priority text not null default 'P2'
    check (priority in ('P0', 'P1', 'P2')),
  add column country text not null default '';

create index nra_leads_record_type_idx on public.nra_leads (record_type);
create index nra_leads_priority_idx    on public.nra_leads (priority);
