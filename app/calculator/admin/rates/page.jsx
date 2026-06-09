import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Card, Row, SectionHeader } from "@/app/calculator/_components/ui";
import {
  JODHANI_RATES, OM_SHIVAAY_RATES,
  JODHANI_DISCOUNT, WET_STRENGTH_EXTRA,
  GLUE_GSM, GLUE_RATE_PER_KG,
  CASE_PACKING_RATE_PER_BOX,
  CONVERSION_RATE,
  PLATE_COST_PER_COLOUR, SETUP_COST_PER_ORDER,
  PRINTING_RATES,
  HANDLE_DEFAULT_COST, HANDLE_WEIGHT_KG,
} from "@/lib/calc/calculator";
import { fetchPaperRMTables } from "@/lib/calc/rmRates";

export default async function AdminRatesPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (role !== "admin") redirect("/calculator/client");

  // Pull live rates from the Paper RM Database. If unavailable (token missing,
  // network error), fall through to the static tables baked into the source.
  const live = await fetchPaperRMTables();
  const liveJodhani = live?.bySupplier?.Jodhani;
  const liveOmShivaay = live?.bySupplier?.["Om Shivaay"];

  // Jodhani rates are baseline; effective = base − discount + default transport (₹5).
  const defaultTransport = 5;
  const jodhaniGSMs = ["82", "90", "100", "110", "120", "130", "140"];
  const jodhaniBFs = [24, 26, 28];

  // Build the displayed cell value for a Jodhani GSM × BF intersection.
  // Prefers the live RM row; falls back to the static JODHANI_RATES constant.
  function jodhaniCell(gsm, bf) {
    const liveRow = liveJodhani?.[gsm]?.[bf];
    if (liveRow) {
      const eff = Math.round((liveRow.baseRate - liveRow.discount + defaultTransport) * 100) / 100;
      return { effective: eff, base: liveRow.baseRate, source: "live" };
    }
    const staticBase = JODHANI_RATES[gsm]?.[bf];
    if (!staticBase) return null;
    const eff = Math.round((staticBase - JODHANI_DISCOUNT + defaultTransport) * 100) / 100;
    return { effective: eff, base: staticBase, source: "static" };
  }

  function omShivaayCell(gsm) {
    const liveRow = liveOmShivaay?.[gsm]?.[28];
    if (liveRow) return { rate: liveRow.baseRate - liveRow.discount, source: "live" };
    const staticRow = OM_SHIVAAY_RATES[String(gsm)]?.[28];
    if (staticRow) return { rate: staticRow, source: "static" };
    return null;
  }

  // Fallback rates used by lookupPaperRate when no specific mill table matches.
  const fallbackRates = [
    { type: "Brown Kraft (no Jodhani/Om Shivaay match)", rate: 55 },
    { type: "Bleach Kraft White", rate: 130 },
    { type: "OGR", rate: 125 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Mill Rates & Calculator Constants</h1>
        <p className="text-sm text-gray-500 mb-3 dark:text-gray-400">
          Read-only reference. Paper rates are pulled live from the Supabase
          <code className="text-xs bg-gray-100 mx-1 px-1 py-0.5 rounded dark:bg-gray-800 dark:text-gray-200">master_papers</code>
          table. To change a rate, edit it on the{" "}
          <a href="/factoryos/admin/master-papers" className="underline hover:text-blue-700 dark:hover:text-blue-400">Master RM Rates</a>{" "}
          admin and the calculator picks it up within ~5 minutes.
          Other constants (glue, case pack, handle cost, conversion labour, setup, plate, printing) are still in
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded dark:bg-gray-800 dark:text-gray-200"> lib/calc/calculator.js</code>.
        </p>
        <div className={`mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${live ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-amber-500"}`} />
          {live ? "Live from Supabase master_papers" : "Using fallback constants — Supabase master_papers unreachable"}
        </div>

        <div className="space-y-6">
          <Card title="Jodhani — Brown Kraft (effective ₹/kg)">
            <p className="text-xs text-gray-500 mb-3 dark:text-gray-400">
              Effective = base rate − ₹{JODHANI_DISCOUNT} discount + ₹{defaultTransport} default transport. Wet strength adds another ₹{WET_STRENGTH_EXTRA}/kg.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
                    <th className="text-left pb-2 font-medium">GSM</th>
                    {jodhaniBFs.map((bf) => (
                      <th key={bf} className="text-right pb-2 font-medium">{bf} BF</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jodhaniGSMs.map((gsm) => (
                    <tr key={gsm} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="py-2 font-medium text-gray-700 dark:text-gray-200">{gsm}</td>
                      {jodhaniBFs.map((bf) => {
                        const cell = jodhaniCell(gsm, bf);
                        if (!cell) return <td key={bf} className="py-2 text-right text-gray-300 dark:text-gray-600">—</td>;
                        return (
                          <td key={bf} className="py-2 text-right">
                            <span className="font-medium text-gray-900 dark:text-white">₹{cell.effective.toFixed(2)}</span>
                            <span className="block text-xs text-gray-400 dark:text-gray-500">
                              base ₹{cell.base}{cell.source === "static" ? " (static)" : ""}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Om Shivaay — Brown Kraft (₹/kg)">
            <p className="text-xs text-gray-500 mb-3 dark:text-gray-400">No discount or transport applied — flat rate.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
                  <th className="text-left pb-2 font-medium">GSM</th>
                  <th className="text-right pb-2 font-medium">28 BF</th>
                </tr>
              </thead>
              <tbody>
                {["60", "70"].map((gsm) => {
                  const cell = omShivaayCell(gsm);
                  if (!cell) return null;
                  return (
                    <tr key={gsm} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="py-2 font-medium text-gray-700 dark:text-gray-200">{gsm}</td>
                      <td className="py-2 text-right">
                        <span className="font-medium text-gray-900 dark:text-white">₹{cell.rate.toFixed(2)}</span>
                        {cell.source === "static" && <span className="block text-xs text-gray-400 dark:text-gray-500">static fallback</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card title="Fallback rates (for mills not in the main tables)">
            <p className="text-xs text-gray-500 mb-3 dark:text-gray-400">
              Used by the client calculator when no Jodhani/Om Shivaay match applies. Admin can override manually on the calculator form.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
                  <th className="text-left pb-2 font-medium">Paper type</th>
                  <th className="text-right pb-2 font-medium">Rate (₹/kg)</th>
                </tr>
              </thead>
              <tbody>
                {fallbackRates.map((row) => (
                  <tr key={row.type} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="py-2 text-gray-700 dark:text-gray-200">{row.type}</td>
                    <td className="py-2 text-right font-medium text-gray-900 dark:text-white">₹{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Fixed costs">
            <table className="w-full">
              <tbody>
                <SectionHeader label="Per-bag costs (material)" />
                <Row label="Glue" value={`${GLUE_GSM} GSM @ ₹${GLUE_RATE_PER_KG}/kg`} />
                <Row label="Case packing" value={`₹${CASE_PACKING_RATE_PER_BOX} per case`} sub="divided by case pack to get ₹/bag" />
                <Row label="Rope Handle cost" value={`₹${HANDLE_DEFAULT_COST.rope_handle}/bag default`} />
                <Row label="Flat Handle cost" value={`₹${HANDLE_DEFAULT_COST.flat_handle}/bag default`} />
                <Row label="Rope Handle weight" value={`${(HANDLE_WEIGHT_KG.rope_handle * 1000).toFixed(0)} g`} />
                <Row label="Flat Handle weight" value={`${(HANDLE_WEIGHT_KG.flat_handle * 1000).toFixed(0)} g`} />

                <SectionHeader label="Conversion labour (₹/kg of paper)" />
                <Row label="SOS" value={`₹${CONVERSION_RATE.sos}/kg`} />
                <Row label="Rope Handle" value={`₹${CONVERSION_RATE.rope_handle}/kg`} />
                <Row label="Flat Handle" value={`₹${CONVERSION_RATE.flat_handle}/kg`} />
                <Row label="V-Bottom" value={`₹${CONVERSION_RATE.v_bottom_gusset}/kg`} />

                <SectionHeader label="One-time costs (amortised across order qty)" />
                <Row label="Setup cost per run" value={`₹${SETUP_COST_PER_ORDER.toLocaleString()}`} sub="machine setup + setup wastage + QC" />
                <Row label="Plate cost per colour" value={`₹${PLATE_COST_PER_COLOUR.toLocaleString()}`} sub="printed bags only" />

                <SectionHeader label="Printing rates (₹/kg of paper)" />
                <Row label="10% coverage" value={`₹${PRINTING_RATES[10]}/kg`} />
                <Row label="30% coverage" value={`₹${PRINTING_RATES[30]}/kg`} />
                <Row label="100% coverage" value={`₹${PRINTING_RATES[100]}/kg`} />
              </tbody>
            </table>
          </Card>

          <Card title="Default wastage %">
            <p className="text-xs text-gray-500 mb-3 dark:text-gray-400">Applied to paper cost when admin doesn&apos;t override.</p>
            <table className="w-full">
              <tbody>
                <Row label="SOS" value="10%" />
                <Row label="Rope Handle / Flat Handle" value="7%" />
                <Row label="V-Bottom" value="5%" />
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
