import { cookies } from "next/headers";
import { clearCookie } from "@/lib/hub/auth";

export const runtime = "nodejs";

export async function POST() {
  cookies().set(clearCookie());
  return Response.json({ ok: true });
}
