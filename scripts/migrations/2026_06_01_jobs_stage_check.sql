-- PR5 — Job lifecycle correctness (L1).
--
-- jobs.stage was a plain text column with no DB-level constraint, so a
-- typo from any path (a direct API hit, a forgotten migration, an
-- airtable-style 'Discharged') was permanent and silently broke every
-- consumer that switch'd on the canonical stage list. The API now
-- validates body.stage against STAGES, but a CHECK at the storage layer
-- closes off every other path too.
--
-- Pre-check (verified before this migration): all 115 existing rows
-- already match the canonical list — no backfill required. Confirmed via:
--   SELECT DISTINCT stage FROM jobs;
--
-- Already applied to production via Supabase MCP under the same
-- migration name. This file is the durable record.

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_stage_check
  CHECK (stage IN (
    'RM Pending',
    'Under Printing',
    'In Conversion',
    'Packing',
    'Ready for Dispatch',
    'Dispatched',
    'Delivered'
  ));
