# PET lid photos — drop-in folder

The "Lid styles" gallery on `/pet-cups` shows one card per PET lid. Each card
loads its photo from this folder, **named by the lid's SKU**. Drop a file in
using the SKU as the filename (any of `.jpg` / `.jpeg` / `.png` / `.webp`) and
it appears automatically — no code change. Until a file exists, the card shows
a "Photo coming soon" placeholder.

Recommended: square images (1:1), ~800×800px, product centred on a clean light
background to match the monochrome page style.

The list is driven by the database — every PET lid SKU shown on the page
(Flat / Dome / Sipper sections, Ø78–Ø117) just needs a matching `<SKU>.<ext>`
here. Current photos came from the Jingyu 98mm rate-request sheet (Jun 2026):

| File           | Lid |
|----------------|-----|
| `LID-051.png`  | 98mm Flat PET Lid (straw slot) |
| `LID-057.png`  | 98mm Dome PET Lid (straw slot) |
| `LID-066.png`  | 98mm PET Sipper Lid |
