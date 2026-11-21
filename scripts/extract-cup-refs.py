#!/usr/bin/env python3
"""Lift cup dies and printer nests VERBATIM from the Aeros artwork files into lib/dieline/*.js.

Rule zero of the artwork cortex: the outline is never touched. Nothing here is drawn by formula; every line is read
from the KLD template or from the printer's own punch file, in millimetres, to 0.001 mm.

  python3 scripts/extract-cup-refs.py "<path to Aeros Artworks>"

Writes lib/dieline/cup-kld-refs.js (single-cup dies) and lib/dieline/cup-nest-refs.js (printer nests). Needs PyMuPDF.
"""
import sys, os, math, json, statistics as st
import fitz

K = 25.4 / 72
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/Aeros Webapp/Aeros Artworks")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib", "dieline")
BLACK, BLEED, LIMIT = (0.0, 0.0, 0.0), (0.95, 0.78, 0.05), (0.83, 0.16, 0.16)


def circ(a, b, c):
    d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
    if abs(d) < 1e-9:
        return None
    ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d
    uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d
    return ux, uy, math.hypot(a[0] - ux, a[1] - uy)


def bz(P, t):
    u = 1 - t
    return (u ** 3 * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t ** 3 * P[3][0],
            u ** 3 * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t ** 3 * P[3][1])


def segs_of(dr):
    out = []
    for it in dr["items"]:
        if it[0] == "l":
            out.append(["l", (it[1].x * K, it[1].y * K), (it[2].x * K, it[2].y * K)])
        elif it[0] == "c":
            out.append(["c"] + [(q.x * K, q.y * K) for q in it[1:5]])
        elif it[0] == "re":
            r = it[1]
            pts = [(r.x0 * K, r.y0 * K), (r.x1 * K, r.y0 * K), (r.x1 * K, r.y1 * K), (r.x0 * K, r.y1 * K)]
            out += [["l", pts[i], pts[(i + 1) % 4]] for i in range(4)]
    return out


def col(dr, key="color"):
    return tuple(round(c, 2) for c in (dr.get(key) or ()))


def kld(cup_id, label, rel, spec):
    """A single-cup KLD spec frame: black = cut + folds, yellow = bleed, red = limit, all about one cone centre."""
    pg = fitz.open(os.path.join(ROOT, rel))[0]
    drs = pg.get_drawings()
    black = [d for d in drs if col(d) == BLACK and abs((d.get("width") or 0) - 0.24) < 0.05]
    arcs = []
    for d in black:
        for s in segs_of(d):
            if s[0] == "c":
                c = circ(s[1], bz(s[1:], .5), s[4])
                if c and c[2] > 150 and math.hypot(s[4][0] - s[1][0], s[4][1] - s[1][1]) > 40:
                    arcs.append(c)
    C = (st.median(a[0] for a in arcs), st.median(a[1] for a in arcs))
    pol = lambda q: (math.hypot(q[0] - C[0], q[1] - C[1]), math.degrees(math.atan2(q[0] - C[0], C[1] - q[1])))
    radii = sorted(a[2] for a in arcs)
    r_top, r_bot = radii[-1], radii[0]
    half = max(abs(pol(s[k])[1]) for d in black for s in segs_of(d) if s[0] == "c"
               and (c := circ(s[1], bz(s[1:], .5), s[4])) and abs(c[2] - r_top) < 0.6 for k in (1, 4))
    lim_a = half + 0.9
    cut, crease, limit, bleed = [], [], [], []
    for d in drs:
        c = col(d)
        segs = segs_of(d)
        if not segs:
            continue
        if c == BLEED:
            bleed = [s[1] for s in segs] + [segs[-1][2]]
            continue
        if c == LIMIT:
            limit = [s[1] for s in segs] + [segs[-1][2]]
            continue
        if d not in black:
            continue
        pp = [pol(q) for s in segs for q in (s[1], s[-1])]
        rs, an = [p[0] for p in pp], [p[1] for p in pp]
        if min(rs) < r_bot - 0.6 or max(rs) > r_top + 0.6 or max(abs(a) for a in an) > lim_a:
            continue  # dimension lines, leaders, title block
        n = len(segs)
        if n == 2 and all(s[0] == "c" for s in segs):
            r = sum(rs) / len(rs)
            (cut if (abs(r - r_bot) < 0.4 or abs(r - r_top) < 0.4) else crease).extend(segs)
        elif n == 1 and segs[0][0] == "l":
            # a lone full-height line is never the knife (the side edges are drawn in the corner-cap paths): it is a
            # fold / reference line - the glue-seam line (parallel to the edge, so not exactly radial) or the joint line
            if abs(rs[0] - rs[1]) > 50 and abs(an[0] - an[1]) < 0.4:
                crease.extend(segs)
        elif max(abs(a) for a in an) > half - 1.2 and all(abs(a) > half - 1.6 for a in an):
            cut += segs  # corner caps + side edges drawn as one path
    allp = [q for s in cut for q in s[1:]] + bleed
    x0, y0 = min(q[0] for q in allp), min(q[1] for q in allp)
    sh = lambda q: [round(q[0] - x0, 3), round(q[1] - y0, 3)]
    ref = dict(id=cup_id, label=label, source="Aeros Artworks/" + rel, centre=sh(C), **spec,
               cut=[[s[0]] + [sh(q) for q in s[1:]] for s in cut], crease=[[s[0]] + [sh(q) for q in s[1:]] for s in crease],
               limit=[sh(q) for q in limit], bleed=[sh(q) for q in bleed])
    allq = [q for s in ref["cut"] for q in s[1:]] + ref["bleed"]
    ref["w"], ref["h"] = round(max(q[0] for q in allq), 3), round(max(q[1] for q in allq), 3)
    print(f"  {cup_id}: cut {len(cut)} segs, folds {len(crease)}, limit {len(limit)} pts, bleed {len(bleed)} pts, "
          f"R {r_bot:.2f}..{r_top:.2f}, half angle {half:.2f} deg, blank {ref['w']} x {ref['h']} mm")
    return ref


def nest(nest_id, label, rel, cup):
    """A printer's punch file: every fan outline, register mark, label and the page border, verbatim."""
    d = fitz.open(os.path.join(ROOT, rel))
    pg = d[0]
    W, H = pg.rect.width * K, pg.rect.height * K
    fans, marks, labels, border = [], [], [], []
    for dr in pg.get_drawings():
        segs = segs_of(dr)
        if not segs:
            continue
        if dr.get("fill") is not None and dr.get("color") is None:
            labels.append(segs)
            continue
        big = [c for s in segs if s[0] == "c" and (c := circ(s[1], bz(s[1:], .5), s[4])) and c[2] > 200
               and math.hypot(s[4][0] - s[1][0], s[4][1] - s[1][1]) > 30]
        if big:
            cx, cy = st.median(c[0] for c in big), st.median(c[1] for c in big)
            rt = max(c[2] for c in big)
            top = [s for s in segs if s[0] == "c" and (c := circ(s[1], bz(s[1:], .5), s[4])) and c[2] > rt - 3 and c[2] > 200]
            mx = st.mean(q[0] for s in top for q in (s[1], s[4]))
            my = st.mean(q[1] for s in top for q in (s[1], s[4]))
            fans.append(dict(centre=[round(cx, 3), round(cy, 3)], rot=round(math.degrees(math.atan2(mx - cx, cy - my)), 3),
                             segs=[[s[0]] + [[round(q[0], 3), round(q[1], 3)] for q in s[1:]] for s in segs]))
        elif len(segs) == 4 and all(s[0] == "l" for s in segs) and dr["rect"].width * K > W * 0.9:
            border = [[s[0]] + [[round(q[0], 3), round(q[1], 3)] for q in s[1:]] for s in segs]
        else:
            marks += [[s[0]] + [[round(q[0], 3), round(q[1], 3)] for q in s[1:]] for s in segs]
    fans.sort(key=lambda f: (round(f["centre"][0] / 50), f["segs"][0][1][1]))
    print(f"  {nest_id}: page {W:.2f} x {H:.2f} mm, {len(fans)} fans, {len(marks)} mark strokes, {len(labels)} labels, border {len(border)}")
    return dict(id=nest_id, label=label, cup=cup, source="Aeros Artworks/" + rel, page=[round(W, 3), round(H, 3)], fans=fans, marks=marks,
                labels=[[[s[0]] + [[round(q[0], 3), round(q[1], 3)] for q in s[1:]] for s in path] for path in labels], border=border)


print("cup dies")
klds = {
    "sw8": kld("sw8", "8 oz (250 mL) single-wall paper cup", "KLD Templates/Paper Cups/08oz-250ml-paper-cup-SW.pdf",
               dict(kld="KLD-CUP-08SW v1", wall="single", TD=80, BD=56, H=95)),
    "dw8": kld("dw8", "8 oz (250 mL) double-wall paper cup, outer wrap", "KLD Templates/Paper Cups/08oz-250ml-paper-cup-DW.pdf",
               dict(kld="KLD-CUP-08DW v1", wall="double", TD=80, BD=56, H=95)),
}
print("printer nests")
nests = {
    "dw8-12up": nest("dw8-12up", "8 oz DW outer wrap, 12-up 676 x 415 mm (Blueline and Lucky Offset)",
                     "Customer Artwork/Cafe Void/8oz Paper Cup DW/Printing Vendor Files/Blueline/cafe-void_250ml-8oz_paper-cup-DW_outer-wrap_OFFSET-PUNCH-12up-676x415mm-v1-VENDOR-BLUELINE.pdf", "dw8"),
}
HEAD = ("// {what} - lifted VERBATIM (to 0.001 mm) from the Aeros artwork files by scripts/extract-cup-refs.py.\n"
        "// RULE ZERO (artwork cortex): the outline is never touched. Regenerate with the script, never edit by hand.\n"
        "// Frame: mm, x right, y down.\n")
open(os.path.join(OUT, "cup-kld-refs.js"), "w").write(
    HEAD.format(what="CUP KLD REFERENCES: cut / fold / bleed / limit lines of each single-cup die (origin = top-left of cut + bleed; centre = the cone centre all arcs share)")
    + "export const CUP_KLD_REFS = " + json.dumps(klds, separators=(",", ":")) + ";\n")
open(os.path.join(OUT, "cup-nest-refs.js"), "w").write(
    HEAD.format(what="CUP NEST REFERENCES: the printer's own punch layout - every fan outline, register mark, label and the page border (origin = page top-left)")
    + "export const CUP_NEST_REFS = " + json.dumps(nests, separators=(",", ":")) + ";\n")
print("written")
