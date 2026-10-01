// FactoryOS v1 scope switches — Arjun, 01-Oct-2026: "we cannot make this OS
// so difficult that the app is not usable; start with v1, then build v2."
// Features that exist in code but are hidden from the team until v2.
export const V1 = {
  // Push finished goods into WarehouseOS from the job. Off for v1 — goods go
  // straight to dispatch; the card and the "push pending" counters are hidden.
  warehousePush: false,
  // Printing vendors (Blue Line, Viana) work from the PDF job order, not the
  // portal. Hide "awaiting vendor acceptance" style prompts, and judge
  // "printer late" by our own stage, never by a vendor milestone.
  vendorPortal: false,
};
