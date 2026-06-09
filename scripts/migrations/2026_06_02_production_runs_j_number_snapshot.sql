-- PR7 — Audit L3.
--
-- production_runs.job_id FK uses ON DELETE SET NULL, which preserves the
-- run row (financial / shop-floor history must never be deleted because
-- the producing job was). But it also throws away every J# clue — any
-- later "which job was this run for?" lookup hits a dead UUID. Same
-- pattern PR4a fixed for inventory_movements: snapshot the j_number
-- string into the run row so the FK can null cleanly without losing
-- traceability.
--
-- Pre-checked: production_runs is currently empty, so no backfill
-- required. The application-layer write (lib/db/shapes.js) populates
-- the snapshot whenever job_id is set on insert/update.
--
-- Already applied to production via Supabase MCP under the same
-- migration name. This file is the durable record.

ALTER TABLE public.production_runs
  ADD COLUMN IF NOT EXISTS j_number_snapshot text;

COMMENT ON COLUMN public.production_runs.j_number_snapshot IS
  'Snapshot of jobs.j_number at the time of the run, preserved after job delete (FK ON DELETE SET NULL would otherwise null the source). Populated by lib/db/shapes.js when job_id is set.';
