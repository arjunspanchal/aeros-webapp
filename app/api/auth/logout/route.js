// Clears all three cookies so the user is signed out of every module at once.
//
// Phase 1.5d retired minting of the legacy aeros_session and
// aeros_factoryos_session cookies; aeros_hub_session is now the only cookie
// new logins produce. The two legacy clears below remain for one more cycle
// so users with stale 30-day cookies (signed pre-1.5d) get them swept on
// next logout. Once enough time has passed that no live legacy sessions
// remain in the wild, those clears (and the lib/calc/auth + lib/factoryos/auth
// imports here) can be removed in a follow-up cleanup.
import { cookies } from "next/headers";
import { clearCookie as clearHub } from "@/lib/hub/auth";
import { clearCookie as clearCalc } from "@/lib/calc/auth";
import { clearCookie as clearFactoryos } from "@/lib/factoryos/auth";

export const runtime = "nodejs";

export async function POST() {
  const jar = cookies();
  jar.set(clearHub());
  jar.set(clearCalc());
  jar.set(clearFactoryos());
  return Response.json({ ok: true });
}
