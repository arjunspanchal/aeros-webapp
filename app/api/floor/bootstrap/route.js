// Public (QR-opened) operator page bootstrap. Requires an employee session
// (code + PIN via the punch-clock login). Returns who's logged in, the machine
// lines, and in-stock rolls. /floor + /api/floor/* are outside the middleware
// matcher, so each route self-verifies the employee session here.
import { MACHINE_CATEGORIES, listRollsInStock, listMachines, listRmStockLines } from "@/lib/factoryos/floor";
import { currentEmployee } from "@/lib/factoryos/floorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const emp = currentEmployee();
  if (!emp) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const [rolls, machines, stockLines] = await Promise.all([
      listRollsInStock().catch(() => []),
      listMachines().catch(() => []),
      listRmStockLines().catch(() => []),
    ]);
    return Response.json({
      operator: { name: emp.name || "" },
      categories: MACHINE_CATEGORIES,
      machines,     // each carries type (line), feedProfile, and feeds[]
      rolls,
      stockLines,   // for the clam fan feed (pick spec + kg)
    });
  } catch (e) {
    console.error("floor bootstrap", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
