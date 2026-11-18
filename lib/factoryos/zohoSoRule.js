// The "one job per SO item" rule on its own, with no database or Zoho calls,
// so it can be tested directly.
//   so      the Zoho sales order ({ lines: [{ id, name }] })
//   others  jobs already on this SO, not counting the one being saved ({ jNumber, lineId })
//   lineId  the item asked for ("" = work it out)
// Returns { error } or { lineId, lineName }.
export function pickSoLine({ number, so, others = [], lineId = "" }) {
  const lines = ((so && so.lines) || []).filter((l) => l.id);
  const count = Math.max(lines.length, 1);
  let line = null;
  if (lineId) {
    line = lines.find((l) => l.id === String(lineId)) || null;
    if (!line) return { error: `That item is not on ${number}. Pick the item again.` };
  } else if (lines.length === 1) {
    line = lines[0];
  }
  if (line) {
    const clash = others.find((j) => j.lineId === line.id);
    if (clash) return { error: `"${line.name}" on ${number} already has job J# ${clash.jNumber}. One SO item, one job.` };
  }
  if (others.length >= count) {
    return { error: `${number} has ${count} item${count === 1 ? "" : "s"} and already ${others.length} job${others.length === 1 ? "" : "s"} (J# ${others.map((j) => j.jNumber).join(", ")}). One SO item, one job.` };
  }
  if (!line && lines.length > 1) return { error: `${number} has ${lines.length} items. Pick which item this job is for.` };
  return { lineId: line ? line.id : "", lineName: line ? line.name : "" };
}
