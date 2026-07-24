-- Vehicle Dispatch — manifest history roll-up.
--
-- One row per dispatch that HAS a manifest (inner join), with the same totals
-- the calculator and the PDF show. Grouped in Postgres rather than in the app
-- so the history page is a single round-trip instead of N line queries.
--
-- security_invoker = true so the view is subject to the caller's RLS on
-- vehicle_dispatches / vehicle_dispatch_lines — those tables have RLS on with
-- no policies, i.e. service-role only, and this view must not become a way
-- around that.
--
-- Idempotent: safe to re-run.

create or replace view public.v_vehicle_dispatch_manifests
with (security_invoker = true) as
select
  d.id                        as dispatch_id,
  d.dispatch_no,
  d.dispatch_date,
  d.status,
  d.invoice_no,
  d.customer_name,
  d.client_id,
  d.account_manager_name,
  d.vehicle_size,
  d.vehicle_number,
  d.transporter_name,
  d.from_city,
  d.to_city,
  count(l.id)                                                     as line_count,
  coalesce(sum(l.box_count), 0)                                   as total_boxes,
  coalesce(sum(l.box_count * coalesce(l.units_per_case, 0)), 0)   as total_pcs,
  round(coalesce(sum(l.box_count * l.kg_per_box), 0), 2)          as total_kg,
  round(coalesce(sum(l.box_count * l.cbm_per_box), 0), 3)         as total_cbm,
  -- Lines still short of a spec: their boxes are in total_boxes but their
  -- weight/volume is NOT in the totals, so the history page can flag it.
  count(*) filter (where l.kg_per_box is null and l.box_count > 0)  as missing_kg,
  count(*) filter (where l.cbm_per_box is null and l.box_count > 0) as missing_cbm,
  max(l.created_at)                                               as last_edited_at
from public.vehicle_dispatches d
join public.vehicle_dispatch_lines l on l.dispatch_id = d.id
where d.deleted_at is null
group by d.id;
