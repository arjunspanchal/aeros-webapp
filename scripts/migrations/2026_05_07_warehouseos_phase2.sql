-- WarehouseOS Phase 2 — Movement posting (Inward / Outward / Transfer / Adjustment)
--
-- The whole post is one Postgres function call so it runs atomically. No more
-- "posted=false then flip" dance — by the time the function returns, the header
-- and all its lines are in, the trigger has applied stock changes for each line,
-- and movement_no is generated.
--
-- Movement number scheme: <PREFIX>-<YYYY>-<NNNN>, sequence per (prefix, year).
-- Prefixes: IN / OUT / TR / ADJ. Sequence is computed from MAX inside the
-- function — fine for our volume (no concurrency hot-path on warehouse posts).

CREATE OR REPLACE FUNCTION post_movement(
  p_type            text,
  p_reference_type  text,
  p_reference       text,
  p_movement_date   date,
  p_notes           text,
  p_source_job_id   uuid,
  p_created_by      text,
  p_lines           jsonb
) RETURNS jsonb AS $$
DECLARE
  v_prefix    text := CASE p_type
                       WHEN 'inward'     THEN 'IN'
                       WHEN 'outward'    THEN 'OUT'
                       WHEN 'transfer'   THEN 'TR'
                       WHEN 'adjustment' THEN 'ADJ'
                       ELSE NULL
                     END;
  v_year      text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  v_seq       int;
  v_no        text;
  v_id        uuid;
  v_line      jsonb;
  v_line_count int := 0;
BEGIN
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Invalid movement type: %', p_type;
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  -- Lock the table briefly to serialise sequence generation. Volume is small
  -- so the contention is negligible.
  PERFORM pg_advisory_xact_lock(hashtext('inv_movement_no_' || v_prefix || '_' || v_year));

  SELECT COALESCE(MAX((regexp_match(movement_no, '\d+$'))[1]::int), 0) + 1
    INTO v_seq
    FROM inventory_movements
   WHERE movement_no LIKE v_prefix || '-' || v_year || '-%';

  v_no := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO inventory_movements
    (movement_no, type, reference_type, reference, movement_date, notes,
     source_job_id, posted, posted_at, created_by)
  VALUES
    (v_no, p_type, NULLIF(p_reference_type, ''), NULLIF(p_reference, ''),
     COALESCE(p_movement_date, current_date), NULLIF(p_notes, ''),
     p_source_job_id, true, now(), NULLIF(p_created_by, ''))
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO inventory_movement_lines
      (movement_id, item_id, from_location_id, to_location_id, qty,
       unit_cost, reject_reason, remarks)
    VALUES (
      v_id,
      (v_line->>'item_id')::uuid,
      NULLIF(v_line->>'from_location_id', '')::uuid,
      NULLIF(v_line->>'to_location_id', '')::uuid,
      (v_line->>'qty')::numeric,
      NULLIF(v_line->>'unit_cost', '')::numeric,
      NULLIF(v_line->>'reject_reason', ''),
      NULLIF(v_line->>'remarks', '')
    );
    v_line_count := v_line_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'id',          v_id,
    'movement_no', v_no,
    'line_count',  v_line_count
  );
END;
$$ LANGUAGE plpgsql;

-- View: movements list with aggregated line totals for the history page.
CREATE OR REPLACE VIEW inventory_movements_summary AS
SELECT
  m.id,
  m.movement_no,
  m.type,
  m.reference_type,
  m.reference,
  m.movement_date,
  m.notes,
  m.source_job_id,
  m.posted,
  m.posted_at,
  m.created_at,
  m.created_by,
  COALESCE(l.line_count, 0)  AS line_count,
  COALESCE(l.total_qty, 0)   AS total_qty,
  COALESCE(l.total_value, 0) AS total_value
FROM inventory_movements m
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)            AS line_count,
    SUM(qty)            AS total_qty,
    SUM(qty * COALESCE(unit_cost, 0)) AS total_value
  FROM inventory_movement_lines
  WHERE movement_id = m.id
) l ON true;
