#!/usr/bin/env python3
"""Lift the Aeros HOUSE BAG FOOTERS into the web app as vector data - never redrawn, never retyped.

  python3 scripts/extract-house-marks.py "<path to Aeros Artworks>"

Source: KLD Templates/Paper Bags/SOS/footer/<SKU>-FOOTER.pdf + _FOOTERS.json (built by _tools/sos_footer.py: recycle mark,
food-safe mark, "Give me another life by recycling me", SKU + size line, made in India, Aeros, QR, "Scan to reorder").
Writes public/house/bag-footers.json, kept small by storing each thing once:
  base    the drawings every footer shares (paths, page points)
  glyphs  every distinct letter outline used by the live text (outlined by MuPDF)
  skus    per SKU: its letters (glyph number + matrix) and its QR as a module grid
  symbols parts of the base that are useful on their own (recycle mark, food-safe mark, the recycling line, made in India)
"""
import sys, os, re, json
import fitz

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/Aeros Webapp/Aeros Artworks")
SRC = os.path.join(ROOT, "KLD Templates/Paper Bags/SOS/footer")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "house")
K = 25.4 / 72
n2 = lambda v: ("%.2f" % v).rstrip("0").rstrip(".") or "0"


def path_of(dr):
    d = []; last = None
    for it in dr["items"]:
        if it[0] == "re":
            r = it[1]; d.append("M%s %sH%sV%sH%sZ" % (n2(r.x0), n2(r.y0), n2(r.x1), n2(r.y1), n2(r.x0))); last = None; continue
        if it[0] == "qu":
            q = it[1]; d.append("M%s %sL%s %sL%s %sL%s %sZ" % (n2(q.ul.x), n2(q.ul.y), n2(q.ur.x), n2(q.ur.y), n2(q.lr.x), n2(q.lr.y), n2(q.ll.x), n2(q.ll.y))); last = None; continue
        a = it[1]
        if last is None or abs(a.x - last[0]) > 0.005 or abs(a.y - last[1]) > 0.005:
            d.append("M%s %s" % (n2(a.x), n2(a.y)))
        if it[0] == "l":
            d.append("L%s %s" % (n2(it[2].x), n2(it[2].y))); last = (it[2].x, it[2].y)
        elif it[0] == "c":
            d.append("C%s %s %s %s %s %s" % (n2(it[2].x), n2(it[2].y), n2(it[3].x), n2(it[3].y), n2(it[4].x), n2(it[4].y))); last = (it[4].x, it[4].y)
    return "".join(d)


meta = json.load(open(os.path.join(SRC, "_FOOTERS.json")))
glyphs, gindex, per, page = [], {}, [], None
for m in sorted(meta, key=lambda q: q["sku"]):
    f = os.path.join(SRC, m["footer"])
    if not os.path.exists(f):
        continue
    pg = fitz.open(f)[0]; page = page or (round(pg.rect.width, 3), round(pg.rect.height, 3))
    drs = pg.get_drawings()
    qr = max(drs, key=lambda d: sum(1 for it in d["items"] if it[0] == "re"))
    n = int(re.search(r"(\d+) modules", m["qr"]).group(1)); r = qr["rect"]; mod = r.width / n
    bits = [[0] * n for _ in range(n)]
    for it in qr["items"]:
        if it[0] != "re":
            continue
        q = it[1]
        for i in range(round((q.y0 - r.y0) / mod), round((q.y1 - r.y0) / mod)):
            for j in range(round((q.x0 - r.x0) / mod), round((q.x1 - r.x0) / mod)):
                if 0 <= i < n and 0 <= j < n:
                    bits[i][j] = 1
    shapes = []
    for d in drs:
        if d is qr:
            continue
        if d.get("fill") is not None:
            shapes.append(dict(d=path_of(d), rule="evenodd" if d.get("even_odd") else "nonzero", box=[round(v, 2) for v in d["rect"]]))
        else:
            shapes.append(dict(d=path_of(d), stroke=round(d.get("width") or 1, 2), box=[round(v, 2) for v in d["rect"]]))
    raw = pg.get_svg_image(text_as_path=True)
    defs = {}
    for mm in re.finditer(r'<symbol id="([^"]+)"[^>]*>\s*<path[^>]*?\sd="([^"]+)"', raw):
        defs[mm.group(1)] = mm.group(2)
    for mm in re.finditer(r'<path[^>]*?id="([^"]+)"[^>]*?\sd="([^"]+)"', raw):
        defs.setdefault(mm.group(1), mm.group(2))
    text = []
    for mm in re.finditer(r'<use[^>]*?>', raw):
        tag = mm.group(0); hid = re.search(r'href="#([^"]+)"', tag); tr = re.search(r'transform="matrix\(([^)]+)\)"', tag)
        d = hid and defs.get(hid.group(1))
        if not d or not tr:
            continue
        d = re.sub(r"-?\d*\.\d+", lambda q: ("%.4f" % float(q.group(0))).rstrip("0").rstrip(".") or "0", d)
        if d not in gindex:
            gindex[d] = len(glyphs); glyphs.append(d)
        text.append([gindex[d]] + [round(float(v), 4) for v in re.split(r"[ ,]+", tr.group(1).strip())])
    dims = re.search(r"(\d+)\s*x\s*(\d+)\s*x\s*(\d+)", m["size_line"])
    per.append(dict(sku=m["sku"], size=m["size_line"], W=int(dims.group(1)), G=int(dims.group(2)), H=int(dims.group(3)), t=text, shapes=shapes,
                    qr=dict(x=round(r.x0, 3), y=round(r.y0, 3), m=round(mod, 4), n=n, bits="".join("".join(map(str, row)) for row in bits))))
# base = drawings every footer has, word for word
common = set(s["d"] for s in per[0]["shapes"])
for p in per:
    common &= set(s["d"] for s in p["shapes"])
base = [s for s in per[0]["shapes"] if s["d"] in common]
for p in per:
    p["extra"] = [s for s in p["shapes"] if s["d"] not in common]; del p["shapes"]
inside = lambda s, b: s["box"][0] >= b[0] and s["box"][1] >= b[1] and s["box"][2] <= b[2] and s["box"][3] <= b[3]
mm = lambda x0, y0, x1, y1: [x0 / K, y0 / K, x1 / K, y1 / K]
SYM = [("recycle", "Recycle mark", mm(9.5, -0.2, 16.4, 6.2)), ("food-safe", "Food-safe mark (glass and fork)", mm(17.4, -0.2, 23.2, 5.4)),
       ("recycle-line", "Give me another life by recycling me", mm(-0.2, 7.4, 32.6, 15.6)), ("made-in-india", "made in India", mm(36.4, 12.9, 50.3, 15.4))]
symbols = []
for key, label, b in SYM:
    idx = [i for i, s in enumerate(base) if inside(s, b)]
    if idx:
        bx = [min(base[i]["box"][0] for i in idx), min(base[i]["box"][1] for i in idx), max(base[i]["box"][2] for i in idx), max(base[i]["box"][3] for i in idx)]
        symbols.append(dict(key=key, label=label, paths=idx, box=[round(v, 2) for v in bx]))
os.makedirs(OUT, exist_ok=True)
out = dict(source="Aeros Artworks/KLD Templates/Paper Bags/SOS/footer (sos_footer.py)", page=page, base=[{k: v for k, v in s.items() if k != "box"} for s in base], glyphs=glyphs, symbols=symbols, skus=per)
txt = json.dumps(out, separators=(",", ":"))
open(os.path.join(OUT, "bag-footers.json"), "w").write(txt)
print(f"{len(per)} footers, page {page[0] * K:.1f} x {page[1] * K:.1f} mm, {len(base)} shared drawings, {len(glyphs)} glyph outlines, extra drawings per footer max {max(len(p['extra']) for p in per)}, file {len(txt) / 1e6:.2f} MB")
print("symbols:", [(s["key"], len(s["paths"]), [round(v * K, 1) for v in s["box"]]) for s in symbols])
print("letters per footer:", min(len(p["t"]) for p in per), "to", max(len(p["t"]) for p in per))
