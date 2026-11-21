// SHEET LAYOUT PDF — every up of the die (and its artwork) placed on the press sheet, true scale, vector.
// The die and the artwork are each written ONCE as a PDF form and stamped per up, so a 12-up sheet is no bigger than a
// 1-up. Frame: sheet x along the gripper edge, y away from it (gripper at the top of the page), mm.
//   mode "punch"  = artwork + die outlines + sheet frame, gripper band and notes (the check / approval file)
//   mode "print"  = artwork only, page = the sheet exactly, no marks (what goes to plate)
//   mode "die"    = die only (cut red, crease green), no text - the multi-up die for the die maker
import { PT_PER_MM } from "../cakebox.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "");

function dieOps(doc) {
  const ops = ["0.5 w 1 J 1 j [] 0 d"];
  for (const [layer, rgb] of [["crease", "0 0.6 0"], ["cut", "1 0 0"]]) {
    ops.push(`${rgb} RG`);
    for (const s of doc.segments) {
      if (s.layer !== layer) continue;
      const p = s.pts.map(([x, y]) => `${f(x)} ${f(y)}`);
      ops.push(s.kind === "l" ? `${p[0]} m ${p[1]} l S` : `${p[0]} m ${p[1]} ${p[2]} ${p[3]} c S`);
    }
  }
  return ops.join("\n");
}

/** fit = the chosen sheetFit entry (sw, sh, margins, sheet); ups = layoutUps(...); vector = artworkToPdf(...) or null */
export function sheetLayoutPdf({ doc, fit, ups, vector = null, mode = "punch", title = "", lines = [] }) {
  const W = doc.blank.widthPt, H = doc.blank.heightPt, sw = fit.sw * K, sh = fit.sh * K;
  const marks = mode === "punch", mg = marks ? 15 * K : 0, foot = marks ? (lines.length + 1) * 11 + 6 : 0;
  const PW = sw + 2 * mg, PH = sh + 2 * mg + foot;
  const showArt = mode !== "die" && !!vector, showDie = mode !== "print";

  const objs = []; // bodies, 1-based numbering = index + 1
  const add = (body) => { objs.push(body); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const marks0 = mode === "punch";
  const pageNo = add("PAGE"), contentNo = add("CONTENT"), fontNo = marks0 ? add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>") : 0; // die / print files carry no font
  const form = (content, resources, bbox) => `<< /Type /XObject /Subtype /Form /BBox [${bbox.map(f).join(" ")}] /Resources << ${resources} >> /Length ${content.length} >>\nstream\n${content}\nendstream`;
  const pad = 12 * K, bbox = [-pad, -pad, W + pad, H + pad];
  let dieNo = 0, artNo = 0;
  if (showDie) dieNo = add(form(dieOps(doc), "", bbox));
  if (showArt) {
    const xo = [];
    for (const im of vector.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
    const cs = Object.entries(vector.colorSpaces || {}).map(([k, v]) => `/${k} ${v}`).join(" ");
    artNo = add(form(vector.ops, `${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""}`, bbox));
  }

  const c = [];
  c.push("q", `1 0 0 -1 ${f(mg)} ${f(PH - mg)} cm`); // sheet frame, y down, gripper edge at the top
  if (marks) {
    c.push("0.93 0.93 0.93 rg", `0 0 ${f(sw)} ${f(fit.margins.gripper * K)} re f`, "0.55 0.55 0.55 RG 0.4 w", `0 0 ${f(sw)} ${f(sh)} re S`);
  }
  for (const u of ups) {
    const a = (u.rot * Math.PI) / 180, cs2 = Math.cos(a), sn = Math.sin(a);
    const place = `${f(cs2)} ${f(sn)} ${f(-sn)} ${f(cs2)} ${f(u.cx * K)} ${f(u.cy * K)} cm 1 0 0 1 ${f(-W / 2)} ${f(-H / 2)} cm`;
    if (showArt) {
      const b = u.bleed;
      c.push("q", place, `${f(-b.left * K)} ${f(-b.top * K)} ${f(W + (b.left + b.right) * K)} ${f(H + (b.top + b.bottom) * K)} re W n`, "/Art Do", "Q");
    }
    if (showDie) c.push("q", place, "/Die Do", "Q");
  }
  c.push("Q");
  if (marks) {
    const T = (x, y, s, size = 8) => c.push(`BT /F1 ${size} Tf 0.25 0.25 0.25 rg 1 0 0 1 ${f(x)} ${f(y)} Tm (${esc(s)}) Tj ET`);
    T(mg + 4, PH - mg - fit.margins.gripper * K + 4, `GRIPPER ${fit.margins.gripper} mm - no print`, 7);
    T(mg, foot - 4, title, 9);
    lines.forEach((l, k) => T(mg, foot - 16 - k * 11, l));
  }
  const content = c.join("\n");
  const xr = [dieNo ? `/Die ${dieNo} 0 R` : "", artNo ? `/Art ${artNo} 0 R` : ""].filter(Boolean).join(" ");
  objs[pageNo - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /TrimBox [${f(mg)} ${f(mg + foot)} ${f(mg + sw)} ${f(mg + foot + sh)}] /Contents ${contentNo} 0 R /Resources << ${fontNo ? `/Font << /F1 ${fontNo} 0 R >> ` : ""}/XObject << ${xr} >> >> >>`;
  objs[contentNo - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
