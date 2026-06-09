// Punch-clock: sign the worker out (clears the employee session cookie).
// Matters on a shared kiosk so the next person doesn't punch as the last one.
import { cookies } from "next/headers";
import { clearEmpCookie } from "@/lib/factoryos/empSession";

export const runtime = "nodejs";

export async function POST() {
  cookies().set(clearEmpCookie());
  return Response.json({ ok: true });
}
