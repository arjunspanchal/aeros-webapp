// Board / paper options for the dieline generator — families and grades the
// way Aeros actually buys board (FBB/SBS for food boxes and cake boxes,
// kraft and duplex for economy dies, corrugated flutes for shippers).
// Caliper (mm) is the industry-typical thickness for the grade; it drives the
// outer-dimension readout and is stamped on exported dies. Dims stay internal.
// Engines that take a thickness param use it for fold allowances (tuckbox
// rescales its die-exact E-flute allowances by caliper/1.5; carton/tray/
// sleeves/partition build with it directly); for the rest, allowances remain
// the die maker's call.

export const MATERIALS = [
  {
    id: "white",
    label: "White Paperboard (FBB / SBS)",
    options: [
      { label: "210 gsm (0.27 mm)", gsm: 210, mm: 0.27 },
      { label: "230 gsm (0.31 mm)", gsm: 230, mm: 0.31 },
      { label: "250 gsm (0.35 mm)", gsm: 250, mm: 0.35 },
      { label: "280 gsm (0.40 mm)", gsm: 280, mm: 0.4 },
      { label: "300 gsm (0.42 mm)", gsm: 300, mm: 0.42 },
      { label: "350 gsm (0.50 mm)", gsm: 350, mm: 0.5 },
      { label: "400 gsm (0.55 mm)", gsm: 400, mm: 0.55 },
    ],
  },
  {
    id: "kraft",
    label: "Kraft Paperboard",
    options: [
      { label: "70 gsm bag kraft (0.09 mm)", gsm: 70, mm: 0.09 },
      { label: "80 gsm bag kraft (0.10 mm)", gsm: 80, mm: 0.1 },
      { label: "90 gsm bag kraft (0.11 mm)", gsm: 90, mm: 0.11 },
      { label: "100 gsm bag kraft (0.12 mm)", gsm: 100, mm: 0.12 },
      { label: "120 gsm (0.14 mm)", gsm: 120, mm: 0.14 },
      { label: "190 gsm (0.26 mm)", gsm: 190, mm: 0.26 },
      { label: "250 gsm (0.33 mm)", gsm: 250, mm: 0.33 },
      { label: "300 gsm (0.40 mm)", gsm: 300, mm: 0.4 },
      { label: "350 gsm (0.46 mm)", gsm: 350, mm: 0.46 },
    ],
  },
  {
    id: "duplex",
    label: "Duplex Board (grey back)",
    options: [
      { label: "230 gsm (0.30 mm)", gsm: 230, mm: 0.3 },
      { label: "250 gsm (0.33 mm)", gsm: 250, mm: 0.33 },
      { label: "300 gsm (0.40 mm)", gsm: 300, mm: 0.4 },
      { label: "350 gsm (0.47 mm)", gsm: 350, mm: 0.47 },
      { label: "400 gsm (0.55 mm)", gsm: 400, mm: 0.55 },
    ],
  },
  {
    id: "art",
    label: "Art Paper / Board",
    options: [
      { label: "170 gsm (0.17 mm)", gsm: 170, mm: 0.17 },
      { label: "200 gsm (0.20 mm)", gsm: 200, mm: 0.2 },
      { label: "250 gsm (0.25 mm)", gsm: 250, mm: 0.25 },
      { label: "350 gsm (0.32 mm)", gsm: 350, mm: 0.32 },
    ],
  },
  {
    id: "corrugated",
    label: "Corrugated Board",
    options: [
      { label: "N-flute (0.6 mm)", flute: "N", mm: 0.6 },
      { label: "F-flute (0.8 mm)", flute: "F", mm: 0.8 },
      { label: "E-flute (1.5 mm)", flute: "E", mm: 1.5 },
      { label: "B-flute (2.8 mm)", flute: "B", mm: 2.8 },
      { label: "C-flute (3.8 mm)", flute: "C", mm: 3.8 },
      { label: "5-ply BC (6.5 mm)", grade: "5-ply BC", mm: 6.5 },
      { label: "7-ply (9.8 mm)", grade: "7-ply", mm: 9.8 },
    ],
  },
];

export function materialStamp(familyId, optionIdx, customMm) {
  const fam = MATERIALS.find((m) => m.id === familyId);
  if (!fam) return "";
  const opt = fam.options[optionIdx] || fam.options[0];
  const mm = +customMm > 0 ? +customMm : opt.mm;
  const grade = opt.grade ?? (opt.flute ? `${opt.flute}-flute` : `${opt.gsm} gsm`);
  return `${fam.label.split(" (")[0]} ${grade} (${mm} mm)`;
}

export function materialThicknessMm(familyId, optionIdx, customMm) {
  if (+customMm > 0) return +customMm;
  const fam = MATERIALS.find((m) => m.id === familyId);
  const opt = fam?.options[optionIdx] || fam?.options[0];
  return opt?.mm || 0;
}
