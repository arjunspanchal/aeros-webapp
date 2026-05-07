-- WarehouseOS Phase 2b — FactoryOS → Warehouse handoff
--
-- One RPC, two effects:
--   1) Posts an inward movement (good qty → BWD-FG-RECV by default,
--      reject qty → BWD-REJECT with reason)
--   2) Auto-creates the branded variant SKU when the job carries a brand,
--      cloning attributes from the plain parent and setting needs_review=true.
--   3) Optionally flips the job stage to "Ready for Dispatch" (final push).
--
-- Plain SKU must already exist in inventory_items. Warehouse team owns plain
-- SKUs. Branded variants are owned by FactoryOS — created here.

CREATE OR REPLACE FUNCTION push_job_to_warehouse(
  p_job_id              uuid,
  p_good_qty            numeric,
  p_reject_qty          numeric,
  p_reject_reason       text,
  p_unit_cost           numeric,
  p_good_location_code  text,
  p_final_push          bool,
  p_created_by          text
) RETURNS jsonb AS $$
DECLARE
  v_job              record;
  v_plain_sku        text;
  v_plain_item       record;
  v_brand_norm       text;
  v_branded_sku      text;
  v_target_item_id   uuid;
  v_good_loc_id      uuid;
  v_reject_loc_id    uuid;
  v_lines            jsonb := '[]'::jsonb;
  v_post_result      jsonb;
  v_pushed_total     numeric;
  v_auto_final       bool := false;
BEGIN
  IF p_good_qty IS NULL  THEN p_good_qty  := 0; END IF;
  IF p_reject_qty IS NULL THEN p_reject_qty := 0; END IF;
  IF p_good_qty < 0 OR p_reject_qty < 0 THEN
    RAISE EXCEPTION 'Quantities must be non-negative';
  END IF;
  IF (p_good_qty + p_reject_qty) <= 0 THEN
    RAISE EXCEPTION 'Provide at least one of good_qty or reject_qty';
  END IF;
  IF p_reject_qty > 0 AND (p_reject_reason IS NULL OR p_reject_reason NOT IN ('discard','lost','damaged')) THEN
    RAISE EXCEPTION 'reject_reason must be one of discard / lost / damaged when reject_qty > 0';
  END IF;

  SELECT id, j_number, brand, master_sku, master_product_name, qty, stage
    INTO v_job
    FROM jobs WHERE id = p_job_id;
  IF v_job IS NULL THEN RAISE EXCEPTION 'Job % not found', p_job_id; END IF;

  v_plain_sku := NULLIF(trim(v_job.master_sku), '');
  IF v_plain_sku IS NULL THEN
    RAISE EXCEPTION 'Job % has no master_sku set — link it on the job page before pushing', v_job.j_number;
  END IF;

  SELECT * INTO v_plain_item FROM inventory_items WHERE sku = v_plain_sku AND is_active;
  IF v_plain_item IS NULL THEN
    RAISE EXCEPTION 'Plain SKU % not found in Items master. Warehouse must add it first.', v_plain_sku;
  END IF;

  -- Resolve target item: plain (no brand) OR branded variant (auto-create)
  IF NULLIF(trim(v_job.brand), '') IS NULL THEN
    v_target_item_id := v_plain_item.id;
  ELSE
    v_brand_norm  := regexp_replace(upper(v_job.brand), '[^A-Z0-9]+', '', 'g');
    v_branded_sku := v_plain_sku || '-' || v_brand_norm;
    SELECT id INTO v_target_item_id FROM inventory_items WHERE sku = v_branded_sku;
    IF v_target_item_id IS NULL THEN
      INSERT INTO inventory_items (
        sku, name, category, brand, uom, case_pack, source,
        brand_customer, parent_sku, needs_review,
        gsm, rm_form, rm_type,
        created_by, updated_by
      ) VALUES (
        v_branded_sku,
        v_plain_item.name || ' — ' || v_job.brand,
        v_plain_item.category,
        v_plain_item.brand,
        v_plain_item.uom,
        v_plain_item.case_pack,
        v_plain_item.source,
        v_job.brand,           -- preserve original casing
        v_plain_item.sku,
        true,                  -- needs_review for FM cleanup
        v_plain_item.gsm,
        v_plain_item.rm_form,
        v_plain_item.rm_type,
        p_created_by, p_created_by
      ) RETURNING id INTO v_target_item_id;
    END IF;
  END IF;

  -- Resolve locations
  SELECT id INTO v_good_loc_id FROM inventory_locations
   WHERE code = COALESCE(NULLIF(p_good_location_code, ''), 'BWD-FG-RECV');
  IF v_good_loc_id IS NULL THEN
    RAISE EXCEPTION 'Receiving location % not found', p_good_location_code;
  END IF;

  IF p_reject_qty > 0 THEN
    SELECT id INTO v_reject_loc_id FROM inventory_locations WHERE code = 'BWD-REJECT';
    IF v_reject_loc_id IS NULL THEN
      RAISE EXCEPTION 'BWD-REJECT location missing — check seed data';
    END IF;
  END IF;

  -- Build lines: good first, then reject
  IF p_good_qty > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id',         v_target_item_id::text,
      'to_location_id',  v_good_loc_id::text,
      'qty',             p_good_qty::text,
      'unit_cost',       COALESCE(p_unit_cost::text, ''),
      'remarks',         'Production output (J# ' || v_job.j_number || ')'
    ));
  END IF;

  IF p_reject_qty > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id',         v_target_item_id::text,
      'to_location_id',  v_reject_loc_id::text,
      'qty',             p_reject_qty::text,
      'reject_reason',   p_reject_reason,
      'remarks',         'Production rejects (J# ' || v_job.j_number || ')'
    ));
  END IF;

  v_post_result := post_movement(
    'inward',
    'production',
    v_job.j_number,
    current_date,
    NULL,
    p_job_id,
    p_created_by,
    v_lines
  );

  -- Compute total pushed for this job (sum across all production inwards).
  SELECT COALESCE(SUM(l.qty), 0)
    INTO v_pushed_total
    FROM inventory_movements m
    JOIN inventory_movement_lines l ON l.movement_id = m.id
   WHERE m.source_job_id = p_job_id
     AND m.type = 'inward'
     AND m.reference_type = 'production';

  -- Auto-flip stage when pushed >= job qty, unless caller forced final
  -- in which case we always flip. Skip if job is already past dispatch.
  IF p_final_push OR (v_job.qty IS NOT NULL AND v_pushed_total >= v_job.qty) THEN
    IF v_job.stage NOT IN ('Ready for Dispatch','Dispatched','Delivered') THEN
      UPDATE jobs SET stage = 'Ready for Dispatch', updated_at = now() WHERE id = p_job_id;
      v_auto_final := NOT p_final_push;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'movement_id',  v_post_result->>'id',
    'movement_no',  v_post_result->>'movement_no',
    'item_id',      v_target_item_id::text,
    'item_sku',     COALESCE(v_branded_sku, v_plain_sku),
    'is_branded',   v_branded_sku IS NOT NULL,
    'pushed_total', v_pushed_total,
    'job_qty',      v_job.qty,
    'stage_flipped', (p_final_push OR v_auto_final)
  );
END;
$$ LANGUAGE plpgsql;
