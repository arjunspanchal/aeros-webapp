import { NextResponse } from "next/server";

// Shared shape for the warehouse write routes: lib functions return
// { ok, status, error?, ...rest }.
export function respond(res) {
  const { ok, status, error, ...rest } = res;
  return NextResponse.json(ok ? rest : { error }, { status });
}
export const forbidden = (msg = "Forbidden") => NextResponse.json({ error: msg }, { status: 403 });
export async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}
export function zohoDown(e, what) {
  console.error(`${what} failed:`, e?.message || e);
  return NextResponse.json({ error: "Could not reach Zoho just now. Try again in a minute." }, { status: 502 });
}
