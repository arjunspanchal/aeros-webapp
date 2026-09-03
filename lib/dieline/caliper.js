// Caliper compensation for die-exact band-scaled engines. A reference die is
// cut for one board caliper; its thickness allowances (roll-crease spacing,
// tuck/dust setbacks, slot widths, tab clearances) show up as small offsets
// from the panel band boundaries. Where the reference has clean separation —
// every allowance offset within `radius` of a band anchor, every real feature
// further out — those offsets are rescaled by caliper/refCaliper in REF space
// before band scaling. Endpoint-wise remapping preserves segment connectivity
// automatically (shared endpoints map identically), and at t = refCaliper the
// output is byte-identical to the raw reference.
//
// Shrinking (thinner board) can never invert coordinate order: allowances all
// scale toward their anchor while features stay put. Growing can — so each
// anchor+side carries a scale cap derived from the reference's own points:
// the largest allowance on that side may step up to at most 90% of the way
// to the nearest fixed feature beyond the radius.

export function makeCaliperRemap({ thickness, refCaliper, anchorsX, anchorsY, radius, points, warnings }) {
  const t = +thickness > 0 ? +thickness : refCaliper;
  const tf = Math.min(Math.max(t / refCaliper, 0.15), 2.6);
  if (warnings && Math.abs(t - refCaliper) > 0.01) {
    warnings.push(`Fold allowances stepped for ${t} mm caliper (reference die cut for ${refCaliper} mm board) — have the die maker confirm before cutting.`);
  }

  const nearestIdx = (anchors, v) => {
    let ai = 0;
    for (let k = 1; k < anchors.length; k++) if (Math.abs(v - anchors[k]) < Math.abs(v - anchors[ai])) ai = k;
    return ai;
  };

  const buildAxis = (anchors, axis) => {
    const caps = new Map(); // anchorIdx*2 + (side>0 ? 1 : 0) → scale for that side
    if (tf > 1 && points) {
      const vals = [...new Set(points.map((p) => p[axis]))];
      for (let i = 0; i < anchors.length; i++) {
        for (const side of [-1, 1]) {
          let maxAllow = 0, nextFeat = Infinity;
          for (const v of vals) {
            if (nearestIdx(anchors, v) !== i) continue;
            const d = v - anchors[i];
            if (d * side <= 0) continue;
            const ad = Math.abs(d);
            if (ad <= radius) maxAllow = Math.max(maxAllow, ad);
            else nextFeat = Math.min(nextFeat, ad);
          }
          if (maxAllow > 0 && Number.isFinite(nextFeat)) {
            caps.set(i * 2 + (side > 0 ? 1 : 0), Math.min(tf, (0.9 * nextFeat) / maxAllow));
          }
        }
      }
    }
    return (v) => {
      const i = nearestIdx(anchors, v);
      const d = v - anchors[i];
      if (d === 0 || Math.abs(d) > radius) return v;
      const s = caps.get(i * 2 + (d > 0 ? 1 : 0)) ?? tf;
      return anchors[i] + d * s;
    };
  };

  return { remapX: buildAxis(anchorsX, 0), remapY: buildAxis(anchorsY, 1), tf };
}

// Flatten a cut/crease reference object ({cut:[[kind,pt,pt,..],...], crease:[...]})
// into a plain point list for makeCaliperRemap's cap analysis.
export function refPoints(ref) {
  const pts = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of ref[tag] || []) for (const p of s.slice(1)) pts.push(p);
  }
  return pts;
}
