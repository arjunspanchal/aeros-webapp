// What a box customer proof SAYS, per product - the words and figures that go into boxProofPdf(). Pure functions, so the
// same text is built on the screen and in a test. House wording rules (cortex 4a): plain words, no supplier, SKU, die code,
// file name, layer or plate talk; every size is the size of this job.
import { drawerFit } from "../drawerbox.js";
import { cmykOf } from "./vector-pdf.js";

const r1 = (v) => +(+v).toFixed(1);
const boardWords = (name = "") => (/kraft/i.test(name) ? "Brown kraft board" : /duplex/i.test(name) ? "Duplex board, grey back" : /cupstock/i.test(name) ? "Cupstock board" : /art/i.test(name) ? "Art board" : "White food-grade folding boxboard");

/**
 * DRAWER BOX SLEEVE. values = { L, W, H } (the tray's inside), mm = board caliper, mat = { name, gsm, top },
 * frame = the sleeve die's frame (ys, Ls, glue), areas = the fold program's panels [{ name, box }], blank = { w, h },
 * art = the artwork items, inks = vec.inks [{ label, hex }], process = "pantone" | "cmyk", scale100 = flat drawn at 100 %.
 */
export function drawerSleeveProofSpec({ values, mm, mat, frame, areas, blank, art, inks, process, customer, proofNo, date, scale100 }) {
  const L = +values.L, W = +values.W, H = +values.H, c = +mm || 0.42, f = drawerFit({ L, W, H }, c);
  const out = [f.sleeveInside[2], f.sleeveInside[0] + 2 * c, f.sleeveInside[1] + 2 * c].map(r1); // length, width, height outside
  const kraft = /kraft|brown/i.test(`${mat.name} ${mat.top || ""}`), n = inks.length, named = (k) => !/^Spot \d/.test(k.label);
  const panels = [...areas].sort((a, b) => a.box[1] - b.box[1]).map((a) => ({ label: /top/i.test(a.name) ? "TOP" : /bottom/i.test(a.name) ? "BOTTOM" : "SIDE", box: a.box }));
  const content = art.filter((i) => i.kind !== "flood" && !i.house), ground = art.some((i) => i.kind === "flood");
  const where = (i) => {
    const turned = Math.abs((((i.rot || 0) % 180) + 180) % 180 - 90) < 1, w = turned ? i.h : i.w, h = turned ? i.w : i.h; // size as it sits on the flat
    const pn = panels.find((q) => i.y >= q.box[1] && i.y <= q.box[3]) || panels[0];
    const l = i.x - w / 2 - pn.box[0], r = pn.box[2] - (i.x + w / 2), t = i.y - h / 2 - pn.box[1], b = pn.box[3] - (i.y + h / 2);
    return [i.name || "Artwork", `${r1(w)} mm wide x ${r1(h)} mm tall, on the ${pn.label} panel. ${r1(l)} / ${r1(r)} mm from the two open ends, ${r1(t)} mm from the fold above it and ${r1(b)} mm from the fold below it.`];
  };
  return {
    brand: customer.trim(),
    product: `Drawer Box  |  ${out.map((v) => Math.round(v)).join(" x ")} mm, sleeve with tray`,
    proofNo, date, flatNoun: "flat sleeve", panels,
    facts: [
      ["SIZE", `Drawer box: a printed sleeve, open at both ends, with a tray that slides inside. Sleeve ${out.join(" x ")} mm outside (length x width x height). Tray ${r1(L)} x ${r1(W)} x ${r1(H)} mm inside.`],
      ["BOARD", `${boardWords(mat.name)}, ${mat.gsm} gsm. Printed on the outside only; the inside stays plain.`],
      ["PRINT", process === "pantone" ? `Offset, ${n} Pantone ink${n === 1 ? "" : "s"}.` : "Offset, four-colour process (CMYK)."],
      ["ARTWORK", "Your file, placed as shown on this page."],
      ["INSIDE", "The tray and the cup insert (three cup holes) are plain board, not printed."],
    ],
    colours: process === "pantone" ? inks.map((k, i) => ({ name: named(k) ? k.label : `Colour ${i + 1}`, cmyk: cmykOf(k.hex), use: "as on the artwork" })) : [],
    colourNote: `${process === "pantone" ? "" : "Printed in four-colour process: every colour is built from cyan, magenta, yellow and black. "}${kraft ? "There is no white under the inks: every colour lays over the brown board and prints darker than on white." : "White is the bare board, not an ink."} Judge colour from a printed Pantone guide, never from a screen.`,
    howToRead: "The dark outline is the cut edge of the sleeve. Dashed lines between panels are folds. Blue lines and figures are measurements (mm) - never printed. The colour runs a few millimetres past the cut so no white shows at the edge - that margin is trimmed off. The strip under the bottom panel is the glue flap: it is never printed.",
    checkList: [
      "The logo: spelling, shape and size.",
      process === "pantone" ? `The ${n === 1 ? "colour is the Pantone" : "colours are the Pantones"} you expect.` : "The colours look right for a four-colour print.",
      "Which panel is the top of the box, and which way up the artwork reads (page 2 names the panels).",
      "The glue flap stays unprinted.",
      `The size: sleeve ${out.join(" x ")} mm outside.`,
      ...(scale100 ? [`Printed on A3 at 100 %, the flat sleeve measures ${Math.round(blank.w)} mm across.`] : []),
    ],
    gridNote: [
      "Each panel carries a 10 mm grid, drawn square to its folds, so you can see every element sits straight on its panel. The grid and the panel names are for checking only - they are never printed.",
      "The sleeve is a tube: the four panels fold round the tray, and the glue flap closes it along the bottom edge.",
    ],
    elements: [
      ...content.map(where),
      ...(ground ? [["Colour ground", "Edge to edge on every panel, past the cut. The glue flap stays unprinted."]] : []),
      ["Glue flap", "The strip under the bottom panel is pasted inside the sleeve and stays unprinted."],
      ...(ground ? [] : [["Everything else", "Plain board."]]),
    ],
    iso: { L: out[0], W: out[1], H: out[2], labels: ["length", "width", "height"], open: true, title: "THE SLEEVE - outside size", caption: "The formed sleeve, drawn to scale. Open at both ends: the tray slides in along its length." },
    threeDNotes: [
      "These views are built from the exact artwork on page 1, folded on the real sleeve shape.",
      "They show the sleeve alone. The plain tray and the cup insert slide inside it.",
      "Colour on screen is indicative only.",
    ],
    renderNote: "Illustrations of the finished sleeve in a scene, for look and feel. Page 1 is the exact artwork; colour and fine detail are indicative only.",
    fileSize: out.map((v) => Math.round(v)).join("x"),
  };
}
