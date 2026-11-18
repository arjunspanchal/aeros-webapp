// The warehouse runs on India time. Servers run on UTC, where "today" is still
// yesterday until 5:30 am IST, so every date the warehouse sees comes from here.
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const dayOf = (v) => (v ? (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : new Date(v).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })) : null);
// Whole days from date `a` to today (never negative); null when `a` is empty.
export function daysSince(a) {
  const d = dayOf(a);
  return d ? Math.max(0, Math.round((Date.parse(todayIST()) - Date.parse(d)) / 86400000)) : null;
}
