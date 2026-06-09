-- PR4a — Delete-job safety (C4).
--
-- inventory_movements.source_job_id was a bare uuid column with no foreign
-- key to jobs(id). When a job got deleted, the ledger row survived with a
-- dead UUID — reverse-lookups (J# on inward movements) broke silently.
--
-- ON DELETE SET NULL is the right policy here:
--   • the J# is already snapshotted into inventory_movements.reference by
--     the push_job_to_warehouse RPC (via post_movement), so traceability
--     by J# string survives even when the source_job_id is nulled.
--   • SET NULL preserves the ledger row itself — financial/stock history
--     must never be deleted just because the producing job was.
--
-- Pre-check (run before migration): no orphan source_job_id values exist
-- today, so the constraint adds cleanly without backfill. Confirmed with:
--   SELECT 1 FROM inventory_movements
--    WHERE source_job_id IS NOT NULL
--      AND source_job_id NOT IN (SELECT id FROM jobs)
--    LIMIT 1;  -- returned 0 rows
--
-- Already applied to production via Supabase MCP under the same
-- migration name on 2026-05-25. This file is the durable record.

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_source_job_id_fkey
  FOREIGN KEY (source_job_id)
  REFERENCES public.jobs(id)
  ON DELETE SET NULL;
