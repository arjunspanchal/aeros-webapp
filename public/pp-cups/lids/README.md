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
| `LID-040.jpg`    | 90mm PP Dome Lid (IM) |
| `LID-032.jpg`    | 115mm PP Flat Lid — Injection Molded |
| `LID-033.jpg`    | 90mm PP Sipper Lid — String Lock |
| `LID-034.jpg`    | 90mm PP Sipper Lid — Lock Back Tab |
| `LID-035.jpg`    | 80mm PP Sipper Lid — Lock Back Tab |
| `LID-036.jpg`    | 90mm PP Sipper Lid — Lock Back Tab Oval |
| `LID-037.jpg`    | 90mm PP Sipper Lid — Lock Back Oval Type 2 |
| `LID-038.jpg`    | 90mm PP Sipper Lid — Round Top Twist |
| `LID-039.jpg`    | 90mm PP Sipper Lid — Knob Push-in |
| `LID-044.jpg`    | 85mm PP Sipper Lid — String Lock |

Thermoformed (TF) lids are not listed on this sheet, so they don't need photos.
The list is driven by the database, so any new IM lid SKU added later just needs
a matching `<SKU>.jpg` here.
