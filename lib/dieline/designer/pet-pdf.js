// PET CUP "ART" FILE - what the dry-offset printer makes the plate from: ONE page that IS the print rectangle, exact size,
// artwork only (no outline, no marks, no text), vector, one plate per spot colour. As the house files:
// <brand>_<size>_pet-cup-..._print_ART-vN-VENDOR-ORACLE.pdf (checked against the Jallo Creamery 16 oz file: page 237 x 75 mm).
import { PT_PER_MM } from "../cakebox.js";
const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());

/** vector = artworkToPdf(...) with box = the rectangle; w, h in mm */
export function petArtPdf(vector, w, h) {
  const PW = w * K, PH = h * K, objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); add("PAGE"); add("CONTENT");
  const xo = [];
  for (const im of vector.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
  const cs = Object.entries(vector.colorSpaces || {}).map(([k, v]) => `/${k} ${v}`).join(" ");
  const content = ["q", `1 0 0 -1 0 ${f(PH)} cm`, vector.ops, "Q"].join("\n");
  objs[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /Contents 4 0 R /Resources << ${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >> >>`;
  objs[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
