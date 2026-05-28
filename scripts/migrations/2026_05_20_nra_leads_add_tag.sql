-- Short single-line memory aid per lead — distinct from the longer
-- `notes` field. Arjun was informally putting these at the tail of
-- notes (e.g. "…Wuhan, China, 430014\n\nPET Cups"); promoting to its
-- own column. Backfill of existing rows happened as a separate data
-- pass (extracting trailing line after `\n\n` + a few short-note-only
-- rows where the entire note was the tag).

alter table public.nra_leads
  add column tag text not null default '';

-- Filterable on its own.
create index nra_leads_tag_idx on public.nra_leads (tag) where tag <> '';
