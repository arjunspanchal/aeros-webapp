-- WarehouseOS Phase 1 — Master inventory (items, locations, stock, movements, audits)
--
-- Design decisions captured in the design conversation (May 2026):
--   • Single warehouse (Bhiwandi) with internal zones — see seed at the bottom.
--   • Costing = Weighted Moving Average. avg_cost on inventory_items is updated
--     by the trigger when a posted inward line carries a unit_cost.
--   • Branded variants (e.g. "8oz DW – HIMS Cafe") cannot be created by
--     warehouse staff. They auto-spawn from FactoryOS on first push:
--       parent_sku   → the plain SKU it came from
--       brand_customer → "HIMS Cafe"
--       needs_review = true so FM can clean up the master later.
--   • Rejects categorised: discard / lost / damaged. All land in BWD-REJECT;
--     reason drives reporting.
--   • source_job_id intentionally has no FK constraint — FactoryOS jobs can be
--     renamed/archived, we don't want movements to break.
--
-- Idempotent: safe to re-run. Uses CREATE … IF NOT EXISTS where possible.

-- ---------------------------------------------------------------------------
-- Items master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             text UNIQUE NOT NULL,
  name            text NOT NULL,
  category        text,
  brand           text,
  uom             text NOT NULL DEFAULT 'pcs',
  case_pack       int,
  source          text NOT NULL DEFAULT 'FG' CHECK (source IN ('FG','RM','Clearance','Other')),
  brand_customer  text,
  parent_sku      text,
  needs_review    bool NOT NULL DEFAULT false,
  avg_cost        numeric(12,4) NOT NULL DEFAULT 0,
  gsm             int,
  rm_form         text,
  rm_type         text,
  clearance_item_id uuid REFERENCES clearance_items(id) ON DELETE SET NULL,
  is_active       bool NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  updated_by      text
);

CREATE INDEX IF NOT EXISTS inventory_items_source_idx
  ON inventory_items (source) WHERE is_active;
CREATE INDEX IF NOT EXISTS inventory_items_brand_customer_idx
  ON inventory_items (brand_customer) WHERE brand_customer IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_parent_sku_idx
  ON inventory_items (parent_sku) WHERE parent_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_needs_review_idx
  ON inventory_items (needs_review) WHERE needs_review;
CREATE INDEX IF NOT EXISTS inventory_items_clearance_link_idx
  ON inventory_items (clearance_item_id) WHERE clearance_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  warehouse   text NOT NULL DEFAULT 'Bhiwandi',
  zone        text,
  is_active   bool NOT NULL DEFAULT true,
  is_virtual  bool NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- On-hand stock per (item, location). Maintained by the trigger below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_stock (
  item_id      uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id  uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  qty          numeric(14,4) NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, location_id)
);

CREATE INDEX IF NOT EXISTS inventory_stock_item_idx ON inventory_stock (item_id);

-- ---------------------------------------------------------------------------
-- Movements (header + lines). type drives sign and required from/to fields.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_no     text UNIQUE NOT NULL,
  type            text NOT NULL CHECK (type IN ('inward','outward','transfer','adjustment')),
  reference_type  text,
  reference       text,
  movement_date   date NOT NULL DEFAULT current_date,
  notes           text,
  source_job_id   uuid,
  posted          bool NOT NULL DEFAULT false,
  posted_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS inventory_movements_type_idx       ON inventory_movements (type);
CREATE INDEX IF NOT EXISTS inventory_movements_date_idx       ON inventory_movements (movement_date DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_job_idx        ON inventory_movements (source_job_id) WHERE source_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_movements_posted_idx     ON inventory_movements (posted, movement_date DESC);

CREATE TABLE IF NOT EXISTS inventory_movement_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id       uuid NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  item_id           uuid NOT NULL REFERENCES inventory_items(id),
  from_location_id  uuid REFERENCES inventory_locations(id),
  to_location_id    uuid REFERENCES inventory_locations(id),
  qty               numeric(14,4) NOT NULL CHECK (qty > 0),
  unit_cost         numeric(12,4),
  reject_reason     text CHECK (reject_reason IN ('discard','lost','damaged')),
  remarks           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movement_lines_movement_idx ON inventory_movement_lines (movement_id);
CREATE INDEX IF NOT EXISTS inventory_movement_lines_item_idx     ON inventory_movement_lines (item_id);

-- ---------------------------------------------------------------------------
-- Audits (header + lines). Audit Manager = any FE/FM (gated in app layer).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_no            text UNIQUE NOT NULL,
  scope               text NOT NULL CHECK (scope IN ('full','category','location','item-list')),
  scope_filter        jsonb,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','counting','review','posted','cancelled')),
  scheduled_date      date NOT NULL,
  freeze_movements    bool NOT NULL DEFAULT true,
  audit_manager_email text NOT NULL,
  notes               text,
  posted_at           timestamptz,
  posted_by           text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text
);

CREATE INDEX IF NOT EXISTS inventory_audits_status_idx ON inventory_audits (status);

CREATE TABLE IF NOT EXISTS inventory_audit_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id     uuid NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES inventory_items(id),
  location_id  uuid NOT NULL REFERENCES inventory_locations(id),
  system_qty   numeric(14,4) NOT NULL,
  counted_qty  numeric(14,4),
  variance     numeric(14,4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  counted_by   text,
  counted_at   timestamptz,
  remarks      text,
  UNIQUE (audit_id, item_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Trigger: maintain inventory_stock + WMA cost on posted movement lines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_stock_on_movement()
RETURNS trigger AS $$
DECLARE
  v_movement       record;
  v_total_qty      numeric;
  v_old_avg_cost   numeric;
  v_new_value      numeric;
BEGIN
  SELECT * INTO v_movement FROM inventory_movements WHERE id = NEW.movement_id;
  -- Only act on posted movements. Drafts pile up lines without affecting stock.
  IF NOT v_movement.posted THEN
    RETURN NEW;
  END IF;

  IF NEW.from_location_id IS NOT NULL THEN
    INSERT INTO inventory_stock (item_id, location_id, qty)
    VALUES (NEW.item_id, NEW.from_location_id, -NEW.qty)
    ON CONFLICT (item_id, location_id) DO UPDATE
      SET qty = inventory_stock.qty - NEW.qty,
          updated_at = now();
  END IF;

  IF NEW.to_location_id IS NOT NULL THEN
    INSERT INTO inventory_stock (item_id, location_id, qty)
    VALUES (NEW.item_id, NEW.to_location_id, NEW.qty)
    ON CONFLICT (item_id, location_id) DO UPDATE
      SET qty = inventory_stock.qty + NEW.qty,
          updated_at = now();
  END IF;

  -- Weighted Moving Average update: only inwards with a unit_cost.
  IF v_movement.type = 'inward' AND NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    SELECT COALESCE(SUM(qty), 0) INTO v_total_qty
      FROM inventory_stock WHERE item_id = NEW.item_id;
    SELECT COALESCE(avg_cost, 0) INTO v_old_avg_cost
      FROM inventory_items WHERE id = NEW.item_id;
    -- Old qty = total now − this inward. Pre-inward value = old_qty × old_avg_cost.
    v_new_value := ((v_total_qty - NEW.qty) * v_old_avg_cost) + (NEW.qty * NEW.unit_cost);
    UPDATE inventory_items
       SET avg_cost = CASE WHEN v_total_qty > 0 THEN v_new_value / v_total_qty ELSE NEW.unit_cost END,
           updated_at = now()
     WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_update_stock_on_movement ON inventory_movement_lines;
CREATE TRIGGER tg_update_stock_on_movement
  AFTER INSERT ON inventory_movement_lines
  FOR EACH ROW EXECUTE FUNCTION update_stock_on_movement();

-- ---------------------------------------------------------------------------
-- View: stock position per item with location breakdown + total value
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW inventory_stock_position AS
SELECT
  i.id              AS item_id,
  i.sku,
  i.name,
  i.category,
  i.brand,
  i.brand_customer,
  i.uom,
  i.source,
  i.avg_cost,
  i.needs_review,
  i.is_active,
  COALESCE(SUM(s.qty), 0)                         AS total_qty,
  COALESCE(SUM(s.qty), 0) * i.avg_cost            AS total_value,
  jsonb_object_agg(l.code, s.qty) FILTER (WHERE s.qty IS NOT NULL AND s.qty <> 0) AS by_location,
  MAX(s.updated_at)                               AS last_movement_at
FROM inventory_items i
LEFT JOIN inventory_stock     s ON s.item_id = i.id
LEFT JOIN inventory_locations l ON l.id = s.location_id
GROUP BY i.id;

-- ---------------------------------------------------------------------------
-- Seed Bhiwandi zones
-- ---------------------------------------------------------------------------
INSERT INTO inventory_locations (code, name, warehouse, zone, is_virtual) VALUES
  ('BWD-FG-RECV', 'FG Receiving (production push default)',          'Bhiwandi', 'Receiving', false),
  ('BWD-FG-A',    'FG Storage – Aisle A',                             'Bhiwandi', 'Storage',   false),
  ('BWD-FG-B',    'FG Storage – Aisle B',                             'Bhiwandi', 'Storage',   false),
  ('BWD-CLR',     'Clearance / dead stock',                           'Bhiwandi', 'Clearance', false),
  ('BWD-DISP',    'Dispatch staging',                                 'Bhiwandi', 'Dispatch',  false),
  ('BWD-REJECT',  'Rejects / quality hold',                           'Bhiwandi', 'Reject',    false),
  ('BWD-RM',      'Raw material (reserved for FactoryOS RM merge)',   'Bhiwandi', 'RM',        false)
ON CONFLICT (code) DO NOTHING;
