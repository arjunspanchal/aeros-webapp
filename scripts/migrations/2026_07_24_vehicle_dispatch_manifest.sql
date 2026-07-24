-- WarehouseOS — Vehicle Dispatch manifest lines (the "load calculator").
--
-- One row per box TYPE on the vehicle: the item, how many boxes of it, and
-- the per-box weight/volume used to work out what the vehicle is carrying.
-- Totals (boxes, kg, CBM) are NOT stored — they're summed in the data layer
-- so an edit can never leave a stale total behind, same discipline as the
-- ₹/box and ₹/kg on the parent dispatch.
--
-- Per-box specs are snapshotted onto the line rather than read live from
-- master_products, because:
--   * clearance stock has no master record at all (no dims, no weight), so
--     the team types the numbers in, and
--   * a manifest is a shipping document — it must still print the same
--     numbers a year later even if the master carton spec is revised.
-- spec_source records whether the numbers came from the master or by hand.
--
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.vehicle_dispatch_lines (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null
    references public.vehicle_dispatches(id) on delete cascade,

  -- Print order on the manifest.
  sr_no integer not null default 1,

  -- The box type, always an EXISTING master product — the manifest never
  -- mints a new item. FKs are SET NULL so a retired product can't orphan a
  -- shipped manifest; sku/description carry the readable snapshot.
  master_product_id uuid references public.master_products(id) on delete set null,
  item_id uuid references public.inventory_items(id) on delete set null,
  sku text,
  description text not null,

  box_count integer not null default 0 check (box_count >= 0),

  -- Per-box specs at the time the manifest was built.
  kg_per_box numeric(12,3) check (kg_per_box is null or kg_per_box >= 0),
  cbm_per_box numeric(12,5) check (cbm_per_box is null or cbm_per_box >= 0),
  carton_dims text,          -- "L × W × H" mm, as shown/typed
  units_per_case integer,    -- pcs per box, for the pcs column

  spec_source text not null default 'manual'
    check (spec_source in ('master','manual')),

  created_at timestamptz not null default now()
);

create index if not exists vehicle_dispatch_lines_dispatch_idx
  on public.vehicle_dispatch_lines (dispatch_id, sr_no);
create index if not exists vehicle_dispatch_lines_item_idx
  on public.vehicle_dispatch_lines (item_id);
create index if not exists vehicle_dispatch_lines_master_idx
  on public.vehicle_dispatch_lines (master_product_id);
-- Recency index for the "items you've shipped before" picker history.
create index if not exists vehicle_dispatch_lines_recent_idx
  on public.vehicle_dispatch_lines (created_at desc);

-- RLS enabled but no policies — the server uses the service-role key (RLS
-- bypassed); the anon key has no business reading dispatch manifests.
alter table public.vehicle_dispatch_lines enable row level security;
