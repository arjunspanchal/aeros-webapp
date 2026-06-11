# PP cup photos — drop-in folder

The "Cup styles" carousel on `/pp-cups` shows one card per cup SKU. Each card
loads its photo from this folder, **named by the cup's SKU** (any of `.jpg` /
`.jpeg` / `.png` / `.webp`) — drop a file in and it appears automatically.
Square, ~900×900, product centred. Until a file exists the card shows a
"Photo coming soon" placeholder.

Current SKUs: PP-CUP-12, -12-F, -12-F-85, -16, -16-F, -20, -20-F, -20-F-85,
-24, -24-F (F-Bottom) · PP-CUP-12-U, -12-U-F, -14-U, -14-U-F, -16-U, -16-U-F,
-24-U, -24-U-F (U-Bottom) · PP-CUP-12-F-85-SET. The list is driven by the
database — new cup SKUs just need a matching `<SKU>.jpg` here.
