-- Per-component price on a sample kit. Lets the team capture pricing
-- even when master_products.price_per_unit is null (~22% of the
-- catalog today). The kit picker on the new-dispatch form falls
-- through unit_price → master price → 0 when expanding components.
alter table public.sample_kit_components
  add column if not exists unit_price numeric(12,2);
