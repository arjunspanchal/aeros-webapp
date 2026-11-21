// AEROS HOUSE WATERMARK for 3D views on a customer proof - a port of Aeros Artworks/_tools/watermark.py, same numbers:
// a lattice alternating "Aeros" (bold) and "aeros-x.com" (regular), turned -12 deg, cell 180 x 145 px on a 2048 px image,
// rows staggered by half a cell; white over a soft dark halo (so it reads on light and on dark areas).
// STRENGTH: the house script prints white 0.30 over halo 0.16. Arjun 21-Nov-2026, on the tool's snapshots: "make the Aeros
// watermark a little subtle" - here it is white 0.18 over halo 0.09 (same lattice, same sizes, about 40 % lighter).
const REF = 2048, CELL_W = 180 / REF, CELL_H = 145 / REF, BIG = 30 / REF, SMALL = 21 / REF, ANGLE = -12, WHITE_A = 0.18, HALO_A = 0.09, HALO_OFF = 2;
const FACE = '"Liberation Sans", Arial, Helvetica, sans-serif';

/** the watermark alone on a clear canvas W x H px (laid over each frame of a turntable video) */
export function watermarkLayer(W, H) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d"), cw = CELL_W * W, ch = CELL_H * W, D = Math.hypot(W, H) + 2 * cw;
  const lattice = (colour, alpha, off) => {
    g.save(); g.globalAlpha = alpha; g.fillStyle = colour; g.textBaseline = "middle";
    g.translate(W / 2 + off, H / 2 + off); g.rotate((ANGLE * Math.PI) / 180); g.translate(-D / 2, -D / 2);
    for (let r = 0; r * ch < D + ch; r++) for (let c = 0; c * cw < D + cw; c++) {
      const big = (r + c) % 2 === 0;
      g.font = big ? `bold ${Math.max(9, Math.round(BIG * W))}px ${FACE}` : `${Math.max(7, Math.round(SMALL * W))}px ${FACE}`;
      g.fillText(big ? "Aeros" : "aeros-x.com", c * cw + (r % 2 ? cw / 2 : 0), r * ch);
    }
    g.restore();
  };
  lattice("#000000", HALO_A, HALO_OFF);
  lattice("#ffffff", WHITE_A, 0);
  return cv;
}

/** img = HTMLImageElement | canvas -> a new canvas with the house watermark over it */
export function watermark(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0); g.drawImage(watermarkLayer(W, H), 0, 0);
  return cv;
}
