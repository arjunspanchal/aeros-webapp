# PP / IM lid photos — drop-in folder

The "Lid styles" gallery on `/pp-cups` shows one card per injection-molded lid.
Each card loads its photo from this folder, **named by the lid's SKU**. Drop a
file in using the SKU as the filename (any of `.jpg` / `.jpeg` / `.png` /
`.webp`) and it appears automatically — no code change. Until a file exists, the
card shows a "Photo coming soon" placeholder.

Recommended: square images (1:1), ~800×800px, product centred on a clean light
background to match the monochrome page style.

## Filenames the page looks for

| File (any ext)   | Lid |
|------------------|-----|
| `LID-040.jpg`    | 90mm Dome — Clear (Shuyang render) |
| `LID-074.jpg`    | 90mm Dome — Black (render, watermark cleaned) |
| `LID-033.jpg`    | 90mm String Lock — Frosted (render) |
| `LID-071.jpg`    | 90mm String Lock — Black (render) |
| `LID-039.jpg`    | 90mm Knob Push-in — Clear (render) |
| `LID-072.jpg`    | 90mm Knob Push-in — White (render) |
| `LID-073.jpg`    | 90mm Knob Push-in — Black (render) |
| `LID-034.jpg`    | 90mm Lock Back Tab — Frosted (render) |
| `LID-075.jpg`    | 90mm Lock Back Tab — Black (render) |
| `LID-076.jpg`    | 90mm Lock Back Tab — White (render) |
| `LID-035.jpg`    | 80mm Lock Back Tab (camera) |
| `LID-036.jpg`    | 90mm Lock Back Tab Oval (camera) |
| `LID-037.jpg`    | 90mm Lock Back Oval Type 2 (camera) |
| `LID-038.jpg`    | 90mm Round Top Twist (camera) |
| `LID-044.jpg`    | 85mm String Lock — Lorven (no photo yet) |

Thermoformed (TF) lids and tub / bowl lids (Ø100mm+, e.g. 115/125/150/180mm)
are not listed on this cups sheet, so they don't need photos. The list is driven
by the database, so any new IM cup lid SKU (Ø80–90) added later just needs a
matching `<SKU>.jpg` here.
