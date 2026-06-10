"use client";
// Tiny inline SVG sparkline. Takes a `data` array of numbers, builds a
// path, and draws it with a coloured stroke + filled area gradient. Used
// inside bento tiles to add a sense of motion to the metric numbers.

export default function Sparkline({ data = [], width = 120, height = 32, accent = "#2347D9" }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });
  const d = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  const gradId = `spk-${accent.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor={accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Endpoint dot — anchors the eye on the latest value. */}
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.5" fill={accent} />
    </svg>
  );
}
