// Plain formatting helpers, usable from server pages and client screens.
export const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-IN") : "—");
// India date, whatever the device or server clock is set to.
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? "UTC" : "Asia/Kolkata" });
}
export const who = (email) => String(email || "").split("@")[0];
// "1 box", "12 boxes"; empty when there is no count.
export const boxes = (n, word = "box") => (n ? `${num(Number(n))} ${word}${Number(n) === 1 ? "" : word === "box" ? "es" : "s"}` : "");
