// MATERIAL LIBRARY — every paper and board the dieline tool can use, with every attribute the die, the print check and the
// 3D model need. Grades + GSMs follow what Aeros actually buys (master_papers in Supabase: 102 papers across Brown Kraft,
// Bleach Kraft White, MG, MG Bleached Kraft, OGR, Cupstock; plus the folding boards we buy as sheets).
//
// Arjun 21-Nov-2026: "Assume but keep it assumed until I give the data." EVERY physical value below is ASSUMED (typical for
// the grade) until a measured value replaces it: put the reading in MEASURED (key = material id) with its date and source,
// and the library switches that attribute to status "measured" everywhere. Rates are NOT kept here - they live in
// master_papers (effective_rate_inr_kg) and cortex.

// bulk = caliper / grammage (cm3/g = mm per 1000 gsm). Typical industry values per grade; ASSUMED.
const FAMILIES = [
  { id: "fbb", name: "FBB / SBS white board", kind: "board", use: ["box"], gsm: [210, 230, 250, 280, 300, 350, 400],
    caliper: { 210: 0.27, 230: 0.31, 250: 0.35, 280: 0.4, 300: 0.42, 350: 0.5, 400: 0.55 },
    top: "white, coated", back: "white, uncoated", finish: "coated top", colour3d: { top: "#f6f6f2", back: "#ecebe4" },
    pantoneGuide: "C on the coated top (confirm); U on the uncoated back", processes: ["offset", "digital"], foodContact: "yes, virgin fibre (confirm grade cert)" },
  { id: "duplex-gb", name: "Duplex board, grey back", kind: "board", use: ["box"], gsm: [230, 250, 300, 350, 400],
    caliper: { 230: 0.3, 250: 0.33, 300: 0.4, 350: 0.47, 400: 0.55 },
    top: "white, coated", back: "grey, uncoated", finish: "coated top", colour3d: { top: "#f2f2ee", back: "#9a9a96" },
    pantoneGuide: "C on the coated top (confirm)", processes: ["offset"], foodContact: "no direct food contact (recycled back) - needs a barrier" },
  { id: "kraft-board", name: "Brown kraft board", kind: "board", use: ["box"], gsm: [200, 240, 280, 300, 350], bulk: 1.35,
    top: "brown", back: "brown", finish: "uncoated", colour3d: { top: "#b98b5a", back: "#b08354" },
    pantoneGuide: "U (uncoated)", processes: ["offset", "flexo"], foodContact: "confirm per mill" , dbType: "Brown Kraft" },
  { id: "art-board", name: "Art paper / board", kind: "board", use: ["box"], gsm: [170, 200, 250, 350],
    caliper: { 170: 0.17, 200: 0.2, 250: 0.25, 350: 0.32 },
    top: "white, gloss/matt coated", back: "white, coated", finish: "coated both sides", colour3d: { top: "#fbfbfb", back: "#fbfbfb" },
    pantoneGuide: "C (coated)", processes: ["offset", "digital"], foodContact: "no" },
  { id: "bag-kraft", name: "Brown kraft (bag paper, reel)", kind: "paper", use: ["bag"], gsm: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140], bulk: 1.25,
    top: "brown", back: "brown", finish: "uncoated", colour3d: { top: "#b98b5a", back: "#b08354" },
    pantoneGuide: "U (uncoated)", processes: ["offset (sheeted)", "flexo"], foodContact: "confirm per mill", dbType: "Brown Kraft", bf: [22, 28] },
  { id: "bag-white", name: "Bleached kraft white (bag paper, reel)", kind: "paper", use: ["bag"], gsm: [70, 80, 90, 100, 120], bulk: 1.25,
    top: "white", back: "white", finish: "uncoated", colour3d: { top: "#f4f2ec", back: "#eeebe3" },
    pantoneGuide: "U (uncoated)", processes: ["offset (sheeted)", "flexo"], foodContact: "confirm per mill", dbType: "Bleach Kraft White" },
  { id: "mg", name: "MG kraft (machine glazed)", kind: "paper", use: ["bag"], gsm: [50, 60, 70, 80, 90, 100, 110], bulk: 1.1,
    top: "brown, glazed", back: "brown, rough", finish: "glazed one side", colour3d: { top: "#c09464", back: "#b38656" },
    pantoneGuide: "U", processes: ["flexo", "offset (sheeted)"], foodContact: "confirm per mill", dbType: "MG" },
  { id: "mg-bleached", name: "MG bleached kraft", kind: "paper", use: ["bag"], gsm: [35, 50, 60, 70, 80, 90, 100], bulk: 1.1,
    top: "white, glazed", back: "white, rough", finish: "glazed one side", colour3d: { top: "#f7f5ef", back: "#efece4" },
    pantoneGuide: "U", processes: ["flexo", "offset (sheeted)"], foodContact: "confirm per mill", dbType: "MG Bleached Kraft" },
  { id: "ogr", name: "OGR (oil & grease resistant)", kind: "paper", use: ["bag"], gsm: [40, 50], bulk: 1.05,
    top: "white/brown", back: "same", finish: "grease resistant", colour3d: { top: "#f3efe6", back: "#ebe6db" },
    pantoneGuide: "U", processes: ["flexo"], foodContact: "yes (grease barrier) - confirm cert", dbType: "OGR" },
  // deli wrap sheets: 38 gsm food-grade wrap paper, 0.06 mm (the house wrap geometry files)
  { id: "wrap-white", name: "Wrap paper, white (food grade)", kind: "paper", use: ["wrap"], gsm: [38], caliper: { 38: 0.06 },
    top: "white", back: "white", finish: "uncoated", colour3d: { top: "#fbfaf6", back: "#f6f4ee" },
    pantoneGuide: "U (uncoated); C if the job says so", processes: ["offset 4-up (under 20,000)", "flexo on the reel (over 20,000)"], foodContact: "yes, food grade" },
  { id: "wrap-kraft", name: "Wrap paper, natural kraft (food grade)", kind: "paper", use: ["wrap"], gsm: [38], caliper: { 38: 0.06 },
    top: "brown", back: "brown", finish: "uncoated", colour3d: { top: "#c39a6b", back: "#bb9264" },
    pantoneGuide: "U (uncoated); every ink lays over brown", processes: ["offset 4-up (under 20,000)", "flexo on the reel (over 20,000)"], foodContact: "yes, food grade" },
  { id: "cupstock", name: "Cupstock", kind: "board", use: ["cup", "box"], gsm: [170, 200, 230, 240, 260, 280, 300], bulk: 1.3,
    top: "white", back: "white", finish: "uncoated (PE on request)", colour3d: { top: "#f8f8f4", back: "#efefe9" },
    pantoneGuide: "U (cortex: U codes on uncoated board)", processes: ["flexo", "offset"], foodContact: "yes", dbType: "Cupstock", pe: [0, 1, 2] },
];

// measured readings replace assumed values here, e.g. "fbb-300": { caliperMm: 0.43, date: "2026-11-25", source: "micrometer, Janta lot 123" }
export const MEASURED = {};

const PE_MM = 0.02; // per PE side, ASSUMED (15-18 gsm PE)
const r3 = (v) => Math.round(v * 1000) / 1000;

function build() {
  const out = [];
  for (const f of FAMILIES) {
    for (const g of f.gsm) {
      for (const pe of f.pe || [0]) {
        const id = `${f.id}-${g}${pe ? `-${pe}pe` : ""}`;
        const base = f.caliper && f.caliper[g] != null ? f.caliper[g] : r3((g * f.bulk) / 1000);
        const m = MEASURED[id];
        const caliperMm = m && m.caliperMm ? m.caliperMm : r3(base + pe * PE_MM);
        const st = (key) => (m && m[key] != null ? "measured" : "assumed");
        out.push({
          id, family: f.id, familyName: f.name, kind: f.kind, use: f.use,
          name: `${f.name} ${g} gsm${pe ? ` + ${pe}PE` : ""}`,
          gsm: g, pe,
          caliperMm, caliperStatus: st("caliperMm"),
          densityKgM3: Math.round((g + pe * 16) / caliperMm), // ASSUMED, follows caliper
          top: f.top, back: f.back, finish: pe ? `${f.finish}; PE ${pe === 2 ? "both sides" : "one side"}` : f.finish,
          colour3d: f.colour3d,
          pantoneGuide: f.pantoneGuide, processes: f.processes, foodContact: f.foodContact,
          grain: (m && m.grain) || "machine direction along the reel / sheet long side", grainStatus: st("grain"),
          bf: f.bf ? `${f.bf[0]}-${f.bf[1]}` : null,
          stiffness: (m && m.stiffness) || null, stiffnessStatus: m && m.stiffness ? "measured" : "needed",
          dbType: f.dbType || null,
          source: m ? `${m.source} (${m.date})` : "typical for the grade - ASSUMED until Arjun gives the data",
        });
      }
    }
  }
  return out;
}

export const MATERIAL_LIBRARY = build();
export const MATERIAL_FAMILIES = FAMILIES.map(({ id, name, kind, use }) => ({ id, name, kind, use }));
export const materialById = (id) => MATERIAL_LIBRARY.find((m) => m.id === id) || null;
export const materialsFor = (use) => MATERIAL_LIBRARY.filter((m) => m.use.includes(use));
