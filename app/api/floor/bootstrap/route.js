// Public (QR-opened) operator page bootstrap. Returns everything the wizard
// needs up front: machine lines, operator names, and in-stock rolls. No hub
// session — /floor + /api/floor/* are intentionally outside the middleware
// matcher (same public model as the punch clock). Runs server-side with the
// service-role key, so reads are safe without exposing credentials.
import { MACHINE_CATEGORIES, listRollsInStock } from "@/lib/factoryos/floor";
import { listEmployees } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [employees, rolls] = await Promise.all([
      listEmployees({ activeOnly: true }).catch(() => []),
      listRollsInStock().catch(() => []),
    ]);
    const operators = employees
      .map((e) => ({ id: e.id, name: e.name }))
      .filter((e) => e.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ categories: MACHINE_CATEGORIES, operators, rolls });
  } catch (e) {
    console.error("floor bootstrap", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
