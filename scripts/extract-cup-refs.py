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
    cut, crease, limit, bleed, frames, added = [], [], [], [], [], []
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
        else:
            frames.append(segs)  # a closed box bounded by the fold arcs (the 12 oz SW KLD draws its bottom fold only here)
    # fold arcs that exist only as a side of such a box: add each once, if no fold arc is already at that radius
    have = [sum(pol(q)[0] for q in (s[1], s[-1])) / 2 for s in crease if s[0] == "c"]
    for segs in frames:
        for s in segs:
            if s[0] != "c" or math.hypot(s[4][0] - s[1][0], s[4][1] - s[1][1]) < 40:
                continue
            r = (pol(s[1])[0] + pol(s[4])[0]) / 2
            if r_bot + 2 < r < r_top - 2 and not any(abs(r - h) < 0.6 for h in have):
                crease.append(s); added.append(r)
    for r in added:
        have.append(r)
    if added:
        print(f"    {cup_id}: fold arc(s) taken from the KLD's fold box at R {sorted(set(round(r, 2) for r in added))}")
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


def tub(tub_id, label, n, ml):
    """A paper tub: the team's single fan, already split into cut / guides / printed area and measured by the house
    tub tools (KLD Templates/Paper Tubs/_source/tub<N>_geo.json + _die-paths.json). Every stroke is the supplied one."""
    src = os.path.join(ROOT, "KLD Templates/Paper Tubs/_source")
    G = json.load(open(os.path.join(src, f"tub{n}_geo.json"))); P = {q["n"]: q for q in json.load(open(os.path.join(src, f"tub{n}_die-paths.json")))}
    seg = lambda it: [it[0]] + [tuple(q) for q in it[1:]]
    cut = [seg(it) for k in (1, 2, 3, 4) for it in P[k]["items"]]
    crease = [seg(it) for k in (5, 6, 7) for it in P[k]["items"]]  # bottom fold, glue line, rim-curl line (team guides)
    area = [tuple(it[1]) for it in P[8]["items"]] + [tuple(P[8]["items"][-1][-1])]  # the PRINTED area: art clip minus the brim
    def thin(pts, tol=0.02):  # drop points that sit on the line between their neighbours (a clip path sampled very finely)
        keep = [pts[0]]
        for i in range(1, len(pts) - 1):
            a, b, c = keep[-1], pts[i], pts[i + 1]
            L = math.hypot(c[0] - a[0], c[1] - a[1]) or 1e-9
            if abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / L > tol or math.hypot(b[0] - a[0], b[1] - a[1]) > 4:
                keep.append(b)
        return keep + [pts[-1]]
    area = thin(area)
    allp = [q for s2 in cut for q in s2[1:]] + area
    x0, y0 = min(q[0] for q in allp), min(q[1] for q in allp)
    sh = lambda q: [round(q[0] - x0, 3), round(q[1] - y0, 3)]
    ref = dict(id=tub_id, label=label, source=f"Aeros Artworks/KLD Templates/Paper Tubs/_source/tub{n}_die-paths.json (team single fan, die {G['die']})",
               centre=sh((G["CX"], G["CY"])), kld=f"die {G['die']} ({G['sku']})", wall="single", rules="tub", item="tub", ml=ml, TD=G["TD"], BD=G["BD"], H=G["H"],
               cut=[[s2[0]] + [sh(q) for q in s2[1:]] for s2 in cut], crease=[[s2[0]] + [sh(q) for q in s2[1:]] for s2 in crease],
               limit=[sh(q) for q in area], bleed=[sh(q) for q in area])
    allq = [q for s2 in ref["cut"] for q in s2[1:]] + ref["bleed"]
    ref["w"], ref["h"] = round(max(q[0] for q in allq), 3), round(max(q[1] for q in allq), 3)
    print(f"  {tub_id}: cut {len(cut)} segs, guides {len(crease)}, printed area {len(area)} pts (of {len(P[8]['items'])}), "
          f"R {G['RB']:.2f}..{G['RT']:.2f}, fold {G['R_fold']:.2f}, rim line {G['R_curl']:.2f}, blank {ref['w']} x {ref['h']} mm")
    return ref


def samples(segs, n):
    out = []
    for s in segs:
        for i in range(n + 1):
            t = i / n
            out.append((s[1][0] + (s[2][0] - s[1][0]) * t, s[1][1] + (s[2][1] - s[1][1]) * t) if s[0] == "l" else bz(s[1:], t))
    return out


def rigid_fit(kld_ref, fan):
    """Best rigid placement (turn + move, never scale or mirror) of the single-cup KLD knife on one cup of the nest:
    closest-point pairs, least squares, repeated. Returns (centre the KLD's cone centre lands on, rotation deg, median, max mm)."""
    src = samples([[s[0]] + [tuple(q) for q in s[1:]] for s in kld_ref["cut"]], 30)
    dst = samples([[s[0]] + [tuple(q) for q in s[1:]] for s in fan["segs"]], 60)
    cx, cy = kld_ref["centre"]
    a = math.radians(fan["rot"]); tx, ty = fan["centre"]  # start: cone centre on the arc centre, turned to the top arc
    def place(p):
        x, y = p[0] - cx, p[1] - cy
        return (tx + x * math.cos(a) - y * math.sin(a), ty + x * math.sin(a) + y * math.cos(a))
    cell = 4.0; grid = {}
    for q in dst:
        grid.setdefault((int(q[0] // cell), int(q[1] // cell)), []).append(q)
    def nearest(p):
        gx, gy = int(p[0] // cell), int(p[1] // cell); best = None
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for q in grid.get((gx + i, gy + j), ()):
                    d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
                    if best is None or d < best[0]:
                        best = (d, q)
        return best
    ds = []
    for _ in range(30):
        pairs = [(p, nearest(place(p))) for p in src]
        pairs = [(p, n[1]) for p, n in pairs if n]
        mx = sum(p[0] - cx for p, _ in pairs) / len(pairs); my = sum(p[1] - cy for p, _ in pairs) / len(pairs)
        nx = sum(q[0] for _, q in pairs) / len(pairs); ny = sum(q[1] for _, q in pairs) / len(pairs)
        sxx = sum((p[0] - cx - mx) * (q[0] - nx) + (p[1] - cy - my) * (q[1] - ny) for p, q in pairs)
        sxy = sum((p[0] - cx - mx) * (q[1] - ny) - (p[1] - cy - my) * (q[0] - nx) for p, q in pairs)
        a = math.atan2(sxy, sxx)
        tx = nx - (mx * math.cos(a) - my * math.sin(a)); ty = ny - (mx * math.sin(a) + my * math.cos(a))
    ds = sorted(math.sqrt(nearest(place(p))[0]) for p in src if nearest(place(p)))
    return [round(tx, 3), round(ty, 3)], round(math.degrees(a), 3), ds[len(ds) // 2], ds[-1]


def nest(nest_id, label, rel, cup, kld_ref=None):
    """A printer's punch file: every fan outline, register mark, label and the page border, verbatim.
    A fan may be drawn as one path (8 oz DW) or as several (12 / 16 oz: two side edges + two arcs; the 12 oz SW file even
    carries each stroke twice) - every stroke is kept as it is and grouped by the fan it belongs to."""
    d = fitz.open(os.path.join(ROOT, rel))
    pg = d[0]
    W, H = pg.rect.width * K, pg.rect.height * K
    rnd = lambda segs: [[s[0]] + [[round(q[0], 3), round(q[1], 3)] for q in s[1:]] for s in segs]
    big_of = lambda segs: [c for s in segs if s[0] == "c" and (c := circ(s[1], bz(s[1:], .5), s[4])) and c[2] > 200
                           and math.hypot(s[4][0] - s[1][0], s[4][1] - s[1][1]) > 30]
    arcs, edges, others, labels, border, widths, cols = [], [], [], [], [], [], []
    for dr in pg.get_drawings():
        segs = segs_of(dr)
        if not segs:
            continue
        if dr.get("fill") is not None and dr.get("color") is None:
            labels.append(segs)
            continue
        big = big_of(segs)
        if big:
            arcs.append((segs, big)); widths.append(dr.get("width") or 0); cols.append(col(dr))
        elif len(segs) == 4 and all(s[0] == "l" for s in segs) and dr["rect"].width * K > W * 0.9 and dr["rect"].height * K > H * 0.9:
            border = rnd(segs)
        elif any(s[0] == "l" and math.hypot(s[2][0] - s[1][0], s[2][1] - s[1][1]) > 60 for s in segs):
            edges.append(segs)
        else:
            others.append(segs)
    # fans = clusters of arc centres
    fans = []
    for segs, big in arcs:
        cx, cy = st.median(c[0] for c in big), st.median(c[1] for c in big)
        f = next((f for f in fans if math.hypot(f["c"][0] - cx, f["c"][1] - cy) < 3), None)
        if not f:
            f = dict(c=(cx, cy), segs=[], radii=[]); fans.append(f)
        f["segs"] += segs; f["radii"] += [c[2] for c in big]
    marks = []
    # a side edge belongs to the fan whose arcs it joins: its two ends sit on (or within a bridge gap of) that fan's arc
    # ends. Neighbouring fans' ends are > 5 mm apart, bridges are < 2.5 mm - so the join is never ambiguous. (A test on
    # "is this line radial" is not enough: the next cup's edge runs almost parallel a few mm away.)
    for f in fans:
        f["ends"] = [q for s in f["segs"] for q in (s[1], s[-1])]
    for segs in edges:
        a, b = segs[0][1], segs[-1][-1]
        best = None
        for f in fans:
            da = min(math.hypot(a[0] - q[0], a[1] - q[1]) for q in f["ends"]); db = min(math.hypot(b[0] - q[0], b[1] - q[1]) for q in f["ends"])
            if max(da, db) < 2.5 and (not best or da + db < best[0]):
                best = (da + db, f)
        if best:
            best[1].setdefault("edge", []).extend(segs)
        else:
            marks += rnd(segs)
    for f in fans:
        f["segs"] += f.pop("edge", [])
    for segs in others:
        marks += rnd(segs)
    out = []
    for f in fans:
        cx, cy = f["c"]; rt = max(f["radii"])
        top = [s for s in f["segs"] if s[0] == "c" and (c := circ(s[1], bz(s[1:], .5), s[4])) and c[2] > rt - 3 and c[2] > 200
               and math.hypot(s[4][0] - s[1][0], s[4][1] - s[1][1]) > 30]
        mx = st.mean(q[0] for s in top for q in (s[1], s[4])); my = st.mean(q[1] for s in top for q in (s[1], s[4]))
        out.append(dict(centre=[round(cx, 3), round(cy, 3)], rot=round(math.degrees(math.atan2(mx - cx, cy - my)), 3), segs=rnd(f["segs"])))
    # reading order: columns left to right, each column top to bottom (by where the fan itself sits, not its centre)
    mid = lambda f: (st.mean(q[0] for s in f["segs"] for q in s[1:]), st.mean(q[1] for s in f["segs"] for q in s[1:]))
    out.sort(key=lambda f: (round(mid(f)[0] / 60), mid(f)[1]))
    fit = None
    if kld_ref:  # place the KLD on each cup by best fit (the printer's own drawing of a cup can sit a few tenths off the die)
        meds, maxs = [], []
        for f in out:
            f["centre"], f["rot"], md, mxd = rigid_fit(kld_ref, f)
            meds.append(md); maxs.append(mxd)
        fit = dict(median=round(st.median(meds), 3), max=round(max(maxs), 3))
    spot = "Dieline" if cols and cols[0] == (0.93, 0.0, 0.55) else None
    style = dict(spot=spot, w=round(st.median(widths), 2))
    n_strokes = sum(len(f["segs"]) for f in out)
    print(f"  {nest_id}: page {W:.2f} x {H:.2f} mm, {len(out)} fans ({n_strokes} strokes), {len(marks)} mark strokes, {len(labels)} labels, border {len(border)}, outlines {'Dieline spot' if spot else 'K100'} {style['w']} pt, KLD fit {fit}")
    return dict(id=nest_id, label=label, cup=cup, source="Aeros Artworks/" + rel, page=[round(W, 3), round(H, 3)], style=style, fit=fit, fans=out, marks=marks,
                labels=[rnd(path) for path in labels], border=border)


print("cup dies")
klds = {
    "sw8": kld("sw8", "8 oz (250 mL) single-wall paper cup", "KLD Templates/Paper Cups/08oz-250ml-paper-cup-SW.pdf",
               dict(kld="KLD-CUP-08SW v1", wall="single", TD=80, BD=56, H=95)),
    "dw8": kld("dw8", "8 oz (250 mL) double-wall paper cup, outer wrap", "KLD Templates/Paper Cups/08oz-250ml-paper-cup-DW.pdf",
               dict(kld="KLD-CUP-08DW v1", wall="double", TD=80, BD=56, H=95)),
    "sw12": kld("sw12", "12 oz (350 mL) single-wall paper cup", "KLD Templates/Paper Cups/12oz-350ml-paper-cup-SW.pdf",
                dict(kld="KLD-CUP-12SW v1", wall="single", TD=90, BD=60, H=109)),
    "dw12": kld("dw12", "12 oz (350 mL) double-wall paper cup, outer wrap", "KLD Templates/Paper Cups/12oz-350ml-paper-cup-DW.pdf",
                dict(kld="KLD-CUP-12DW v1", wall="double", TD=90, BD=60, H=111)),
    "sw16": kld("sw16", "16 oz (450 mL) single-wall paper cup", "KLD Templates/Paper Cups/16oz-450ml-paper-cup-SW.pdf",
                dict(kld="KLD-CUP-16SW v1", wall="single", TD=90, BD=60, H=135)),
    "dw16": kld("dw16", "16 oz (450 mL) double-wall paper cup, outer wrap", "KLD Templates/Paper Cups/16oz-450ml-paper-cup-DW.pdf",
                dict(kld="KLD-CUP-16DW v1", wall="double", TD=90, BD=60, H=135)),
}
print("paper tubs")
klds.update({
    "tub350": tub("tub350", "Paper tub 115 mm, 12 oz (350 mL)", 350, 350),
    "tub500": tub("tub500", "Paper tub 115 mm, 16 oz (500 mL)", 500, 500),
    "tub750": tub("tub750", "Paper tub 115 mm, 24 oz (750 mL)", 750, 750),
})
print("printer nests")
CA = "Customer Artwork/"
nests = {
    "dw8-12up": nest("dw8-12up", "8 oz DW outer wrap, 12-up 676 x 415 mm (Blueline and Lucky Offset)",
                     CA + "Cafe Void/8oz Paper Cup DW/Printing Vendor Files/Blueline/cafe-void_250ml-8oz_paper-cup-DW_outer-wrap_OFFSET-PUNCH-12up-676x415mm-v1-VENDOR-BLUELINE.pdf", "dw8", klds["dw8"]),
    "dw12-9up": nest("dw12-9up", "12 oz DW outer wrap, 9-up 751 x 381 mm (Blueline punch KLD; Lucky Offset runs the same sheet)",
                     CA + "Cafe Void/12oz Paper Cup DW/Printing Vendor Files/Blueline/cafe-void_350ml-12oz_paper-cup-DW_outer-wrap_OFFSET-PUNCH-9up-751x381mm-v1-VENDOR-BLUELINE.pdf", "dw12", klds["dw12"]),
    "dw16-9up": nest("dw16-9up", "16 oz DW outer wrap, 9-up 751 x 441 mm (Blueline punch KLD; Lucky Offset runs the same sheet)",
                     CA + "Gordos Tacos/16oz Paper Cup DW/Printing Vendor Files/Blueline/gordos-tacos_450ml-16oz_paper-cup-DW_outer-wrap_OFFSET-PUNCH-9up-751x441mm-v1-VENDOR-BLUELINE.pdf", "dw16", klds["dw16"]),
    "sw12-9up": nest("sw12-9up", "12 oz SW cup, 9-up 737 x 461 mm (Blueline punch KLD)",
                     CA + "Protein Station/12oz Paper Cup SW/Printing Vendor Files/Blueline/protein-station_350ml-12oz_paper-cup-SW_cup_OFFSET-PUNCH-9up-737x461mm-v1-VENDOR-BLUELINE.pdf", "sw12", klds["sw12"]),
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
