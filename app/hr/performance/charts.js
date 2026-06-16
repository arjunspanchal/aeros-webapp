// Pure SVG chart builders for the performance report. Each returns a complete
// <svg> string with inline presentation (no external CSS), so the exact same
// markup renders on-screen (via dangerouslySetInnerHTML) and inside the
// print-to-PDF window. Monochrome Aeros palette with restrained status accents.

const INK = "#2C2C2A";
const MUTED = "#6B6A66";
const TRACK = "#EFEEE9";
const GRID = "#E5E4DF";
const GOOD = "#1D9E75";
const MED = "#BA7517";
const BAD = "#A32D2D";
const LEAVE = "#888780";
const OT_BAR = "#444441";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]),
  );
}
function clip(s, n = 20) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
const band = (pct) => (pct >= 90 ? GOOD : pct >= 75 ? MED : BAD);

// Shared frame for a horizontal-bar chart. rows = [{label, render(x0,x1,y,h)}].
function hbarFrame(rows, { barAreaX = 158, width = 720, rowH = 28, barH = 14, footer = "" } = {}) {
  const top = 8;
  const x1 = width - 52;
  const h = top + rows.length * rowH + (footer ? 26 : 10);
  let body = "";
  rows.forEach((r, i) => {
    const cy = top + i * rowH;
    const by = cy + (rowH - barH) / 2;
    body += `<text x="${barAreaX - 8}" y="${by + barH - 3}" text-anchor="end" font-size="11" fill="${INK}">${esc(clip(r.label))}</text>`;
    body += `<rect x="${barAreaX}" y="${by}" width="${x1 - barAreaX}" height="${barH}" rx="3" fill="${TRACK}"/>`;
    body += r.render(barAreaX, x1, by, barH);
  });
  if (footer) body += `<text x="${barAreaX}" y="${h - 8}" font-size="10.5" fill="${MUTED}">${esc(footer)}</text>`;
  return `<svg viewBox="0 0 ${width} ${h}" width="100%" font-family="system-ui,-apple-system,sans-serif" role="img">${body}</svg>`;
}

// 1) Attendance % ranking — bars coloured by health band, best → worst.
export function attendanceRankingSvg(perEmployee) {
  const data = [...perEmployee].sort((a, b) => b.attendancePct - a.attendancePct);
  if (!data.length) return emptyState("No employees in range.");
  const rows = data.map((p) => ({
    label: p.name,
    render: (x0, x1, by, barH) => {
      const w = Math.max(0, Math.min(100, p.attendancePct)) / 100 * (x1 - x0);
      const c = band(p.attendancePct);
      return (
        `<rect x="${x0}" y="${by}" width="${w.toFixed(1)}" height="${barH}" rx="3" fill="${c}"/>` +
        `<text x="${x1 + 6}" y="${by + barH - 3}" font-size="11" font-weight="500" fill="${c}">${p.attendancePct}%</text>`
      );
    },
  }));
  return hbarFrame(rows, { footer: "Present-equivalent ÷ working days. Green ≥90% · amber 75–89% · red <75%." });
}

// 2) Status breakdown per employee — stacked day counts (on-time / late / leave / absent).
export function statusBreakdownSvg(perEmployee) {
  if (!perEmployee.length) return emptyState("No employees in range.");
  const scale = Math.max(1, ...perEmployee.map((p) => p.workingDays));
  const segs = [
    ["onTime", GOOD],
    ["late", MED],
    ["leave", LEAVE],
    ["absent", BAD],
  ];
  const rows = perEmployee.map((p) => ({
    label: p.name,
    render: (x0, x1, by, barH) => {
      const full = x1 - x0;
      let cx = x0;
      let out = "";
      for (const [key, color] of segs) {
        const v = p[key] || 0;
        if (v <= 0) continue;
        const w = (v / scale) * full;
        out += `<rect x="${cx.toFixed(1)}" y="${by}" width="${w.toFixed(1)}" height="${barH}" fill="${color}"><title>${esc(p.name)} · ${key}: ${v}d</title></rect>`;
        cx += w;
      }
      out += `<text x="${x1 + 6}" y="${by + barH - 3}" font-size="10.5" fill="${MUTED}">${p.workingDays}d</text>`;
      return out;
    },
  }));
  const legend = "On-time ▪ green   Late ▪ amber   Leave ▪ grey   Absent ▪ red   (days)";
  return hbarFrame(rows, { footer: legend });
}

// 3) OT hours leaderboard — who worked the most overtime.
export function otLeaderboardSvg(perEmployee) {
  const data = [...perEmployee].filter((p) => p.ot > 0).sort((a, b) => b.ot - a.ot);
  if (!data.length) return emptyState("No overtime recorded this period.");
  const scale = Math.max(...data.map((p) => p.ot));
  const rows = data.map((p) => ({
    label: p.name,
    render: (x0, x1, by, barH) => {
      const w = (p.ot / scale) * (x1 - x0);
      return (
        `<rect x="${x0}" y="${by}" width="${w.toFixed(1)}" height="${barH}" rx="3" fill="${OT_BAR}"/>` +
        `<text x="${x1 + 6}" y="${by + barH - 3}" font-size="11" font-weight="500" fill="${INK}">${p.ot}h</text>`
      );
    },
  }));
  return hbarFrame(rows, { footer: "Total overtime hours in the period." });
}

// 4) Daily attendance trend — % present each working day.
export function dailyTrendSvg(trend) {
  if (!trend || trend.length < 2) return emptyState("Not enough days to plot a trend yet.");
  const W = 720, H = 230, padL = 38, padR = 14, padT = 14, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const n = trend.length;
  const xAt = (i) => x0 + (n === 1 ? 0 : (i / (n - 1)) * (x1 - x0));
  const yAt = (v) => y1 - (Math.max(0, Math.min(100, v)) / 100) * (y1 - y0);

  let grid = "";
  for (const g of [0, 25, 50, 75, 100]) {
    const y = yAt(g);
    grid += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`;
    grid += `<text x="${x0 - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="${MUTED}">${g}</text>`;
  }
  const pts = trend.map((t, i) => `${xAt(i).toFixed(1)},${yAt(t.pct).toFixed(1)}`);
  const area = `M ${x0},${y1} L ${pts.join(" L ")} L ${x1},${y1} Z`;
  const line = `M ${pts.join(" L ")}`;

  // A few date labels along the X axis (day-of-month).
  let xlabels = "";
  const step = Math.max(1, Math.round(n / 7));
  trend.forEach((t, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const d = t.date.slice(8);
    xlabels += `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${MUTED}">${d}</text>`;
  });

  return (
    `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="system-ui,-apple-system,sans-serif" role="img">` +
    grid +
    `<path d="${area}" fill="${OT_BAR}" fill-opacity="0.10"/>` +
    `<path d="${line}" fill="none" stroke="${OT_BAR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    trend.map((t, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(t.pct).toFixed(1)}" r="2.2" fill="${OT_BAR}"><title>${esc(t.date)}: ${t.pct}%</title></circle>`).join("") +
    xlabels +
    `</svg>`
  );
}

function emptyState(msg) {
  return `<svg viewBox="0 0 720 60" width="100%" font-family="system-ui,-apple-system,sans-serif" role="img"><text x="12" y="34" font-size="12" fill="${MUTED}">${esc(msg)}</text></svg>`;
}
