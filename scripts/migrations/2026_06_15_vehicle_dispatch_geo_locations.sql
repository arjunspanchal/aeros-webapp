-- WarehouseOS Vehicle Dispatch — Google Maps locations for From/To.
-- The From/To pickers (Places Autocomplete) store the resolved place_id +
-- coordinates alongside the existing free-text city, so the detail page can
-- deep-link to Google Maps and the form can auto-fill driving distance via
-- the Routes API. All three remain nullable — locations can still be typed
-- free-hand when the geo key isn't set.
--
-- Idempotent: safe to re-run.

alter table public.vehicle_dispatches
  add column if not exists from_place_id text,
  add column if not exists from_lat numeric(9,6),
  add column if not exists from_lng numeric(9,6),
  add column if not exists to_place_id text,
  add column if not exists to_lat numeric(9,6),
  add column if not exists to_lng numeric(9,6);
