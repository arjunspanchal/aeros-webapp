-- WarehouseOS Phase 3 — Stock audits (cycle counts)
--
-- Two RPCs:
--   create_audit  — inserts the header, snapshots system_qty per (item, location)
--                   into audit_lines based on scope.
--   post_audit    — for every counted line with non-zero variance, builds an
--                   adjustment movement and posts it via post_movement so the
--                   normal stock trigger fires. Audit then locks (status=posted).
--
-- Status lifecycle: counting → review → posted (or → cancelled at any step).
-- 'draft' is unused at this layer — the moment you create_audit, lines are
-- snapshotted and counters can begin.

CREATE OR REPLACE FUNCTION create_audit(
  p_scope               text,
  p_scope_filter        jsonb,
  p_scheduled_date      date,
  p_freeze_movements    bool,
  p_audit_manager_email text,
  p_notes               text,
  p_created_by          text
) RETURNS jsonb AS $$
DECLARE
  v_year  text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  v_seq   int;
  v_no    text;
  v_id    uuid;
  v_lines int;
BEGIN
  IF p_scope NOT IN ('full','category','location','item-list') THEN
    RAISE EXCEPTION 'Invalid scope: %', p_scope;
  END IF;
  IF p_audit_manager_email IS NULL OR p_audit_manager_email = '' THEN
    RAISE EXCEPTION 'audit_manager_email is required';
  END IF;
  IF p_scheduled_date IS NULL THEN p_scheduled_date := current_date; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('inv_audit_no_' || v_year));
  SELECT COALESCE(MAX((regexp_match(audit_no, '\d+$'))[1]::int), 0) + 1
    INTO v_seq
    FROM inventory_audits
   WHERE audit_no LIKE 'AUDIT-' || v_year || '-%';
  v_no := 'AUDIT-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO inventory_audits
    (audit_no, scope, scope_filter, status, scheduled_date,
     freeze_movements, audit_manager_email, notes, created_by)
  VALUES
    (v_no, p_scope, COALESCE(p_scope_filter, '{}'::jsonb), 'counting',
     p_scheduled_date, COALESCE(p_freeze_movements, true),
     p_audit_manager_email, NULLIF(p_notes, ''), NULLIF(p_created_by, ''))
  RETURNING id INTO v_id;

  -- Snapshot every (item, location) in scope where there's stock today.
  -- Items not in inventory_stock (zero qty everywhere) are not auto-included
  -- — the counter can add them ad-hoc later if they find unaccounted stock.
  WITH scope_pairs AS (
    SELECT s.item_id, s.location_id, s.qty AS system_qty
      FROM inventory_stock s
      JOIN inventory_items     i ON i.id = s.item_id
      JOIN inventory_locations l ON l.id = s.location_id
     WHERE i.is_active
       AND CASE p_scope
             WHEN 'full'      THEN true
             WHEN 'category'  THEN i.category = (p_scope_filter->>'category')
             WHEN 'location'  THEN s.location_id::text = (p_scope_filter->>'location_id')
             WHEN 'item-list' THEN s.item_id::text IN (
               SELECT jsonb_array_elements_text(p_scope_filter->'item_ids')
             )
           END
  )
  INSERT INTO inventory_audit_lines (audit_id, item_id, location_id, system_qty)
  SELECT v_id, item_id, location_id, system_qty FROM scope_pairs;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  RETURN jsonb_build_object('id', v_id, 'audit_no', v_no, 'lines', v_lines);
END;
$$ LANGUAGE plpgsql;


-- Add an ad-hoc line for stock the counter physically found that wasn't in the
-- snapshot (system_qty starts at the current on-hand, which may be 0). Caller
-- supplies item_id + location_id; counted_qty is set in a separate count call.
CREATE OR REPLACE FUNCTION add_audit_line(
  p_audit_id     uuid,
  p_item_id      uuid,
  p_location_id  uuid
) RETURNS jsonb AS $$
DECLARE
  v_status   text;
  v_qty      numeric;
  v_existing uuid;
  v_new_id   uuid;
BEGIN
  SELECT status INTO v_status FROM inventory_audits WHERE id = p_audit_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_status NOT IN ('counting','review') THEN
    RAISE EXCEPTION 'Cannot add lines to audit in status %', v_status;
  END IF;

  SELECT id INTO v_existing
    FROM inventory_audit_lines
   WHERE audit_id = p_audit_id AND item_id = p_item_id AND location_id = p_location_id
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'created', false);
  END IF;

  SELECT COALESCE(qty, 0) INTO v_qty
    FROM inventory_stock
   WHERE item_id = p_item_id AND location_id = p_location_id;

  INSERT INTO inventory_audit_lines (audit_id, item_id, location_id, system_qty)
  VALUES (p_audit_id, p_item_id, p_location_id, COALESCE(v_qty, 0))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'created', true);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION post_audit(
  p_audit_id  uuid,
  p_posted_by text
) RETURNS jsonb AS $$
DECLARE
  v_audit       record;
  v_line        record;
  v_lines       jsonb := '[]'::jsonb;
  v_post_result jsonb;
  v_count       int := 0;
  v_uncounted   int;
BEGIN
  SELECT * INTO v_audit FROM inventory_audits WHERE id = p_audit_id;
  IF v_audit IS NULL THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status = 'posted'    THEN RAISE EXCEPTION 'Audit % already posted', v_audit.audit_no; END IF;
  IF v_audit.status = 'cancelled' THEN RAISE EXCEPTION 'Audit % is cancelled', v_audit.audit_no; END IF;

  -- Defensive: warn (via exception) if some lines remain uncounted. Audit
  -- manager must explicitly cancel or count them. Variance = NULL on those.
  SELECT COUNT(*) INTO v_uncounted FROM inventory_audit_lines
    WHERE audit_id = p_audit_id AND counted_qty IS NULL;
  IF v_uncounted > 0 THEN
    RAISE EXCEPTION 'Cannot post: % line(s) still uncounted. Count or remove them first.', v_uncounted;
  END IF;

  FOR v_line IN
    SELECT al.*, l.code AS loc_code
      FROM inventory_audit_lines al
      JOIN inventory_locations l ON l.id = al.location_id
     WHERE al.audit_id = p_audit_id
       AND al.counted_qty IS NOT NULL
       AND al.variance IS NOT NULL
       AND al.variance != 0
  LOOP
    IF v_line.variance > 0 THEN
      -- Counted more than system → inward-style adjustment to the location
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'item_id',         v_line.item_id::text,
        'to_location_id',  v_line.location_id::text,
        'qty',             abs(v_line.variance)::text,
        'remarks',         'Audit ' || v_audit.audit_no || ' (+) ' || v_line.loc_code
      ));
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'item_id',          v_line.item_id::text,
        'from_location_id', v_line.location_id::text,
        'qty',              abs(v_line.variance)::text,
        'remarks',          'Audit ' || v_audit.audit_no || ' (-) ' || v_line.loc_code
      ));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    v_post_result := post_movement(
      'adjustment',
      'audit',
      v_audit.audit_no,
      current_date,
      'Audit reconciliation for ' || v_audit.audit_no,
      NULL,
      p_posted_by,
      v_lines
    );
  END IF;

  UPDATE inventory_audits
     SET status = 'posted',
         posted_at = now(),
         posted_by = NULLIF(p_posted_by, '')
   WHERE id = p_audit_id;

  RETURN jsonb_build_object(
    'audit_no',    v_audit.audit_no,
    'adjustments', v_count,
    'movement_no', v_post_result->>'movement_no',
    'movement_id', v_post_result->>'id'
  );
END;
$$ LANGUAGE plpgsql;


-- View: audit summary for the list page.
CREATE OR REPLACE VIEW inventory_audits_summary AS
SELECT
  a.id,
  a.audit_no,
  a.scope,
  a.scope_filter,
  a.status,
  a.scheduled_date,
  a.freeze_movements,
  a.audit_manager_email,
  a.notes,
  a.posted_at,
  a.posted_by,
  a.created_at,
  a.created_by,
  COALESCE(c.total_lines, 0)    AS total_lines,
  COALESCE(c.counted_lines, 0)  AS counted_lines,
  COALESCE(c.variance_lines, 0) AS variance_lines,
  COALESCE(c.abs_variance, 0)   AS abs_variance
FROM inventory_audits a
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                                AS total_lines,
    COUNT(*) FILTER (WHERE counted_qty IS NOT NULL)                          AS counted_lines,
    COUNT(*) FILTER (WHERE counted_qty IS NOT NULL AND variance != 0)        AS variance_lines,
    SUM(abs(COALESCE(variance, 0)))                                          AS abs_variance
  FROM inventory_audit_lines
  WHERE audit_id = a.id
) c ON true;
