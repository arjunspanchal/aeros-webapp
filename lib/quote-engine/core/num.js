// Small number helpers. The engine keeps full precision internally and only
// rounds at the edges (display lines and the final sell price), because past
// quotes derive per-case and USD figures from the unrounded per-piece value.

export const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export const ceilTo = (n, step) => Math.ceil(n / step) * step;

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** First argument that is a finite number, else undefined. */
export const firstNum = (...vals) => vals.find(isNum);
