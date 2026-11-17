// Simple stage-count bar chart. No chart library — just SVG.
import { STAGES } from "@/lib/factoryos/constants";

const STAGE_FILL = {
  "RM Pending": "#9ca3af",
  "Coating": "#fb923c",
  "Under Printing": "#f59e0b",
  "In Conversion": "#3b82f6",
  "Packing": "#6366f1",
  "Ready for Dispatch": "#10b981",
  "Dispatched": "#16a34a",
  "Delivered": "#0f766e",
};

export default function StatusChart({ jobs, title = "Status overview" }) {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const j of jobs) if (counts[j.stage] !== undefined) counts[j.stage]++;
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      <div className="space-y-2">
        {STAGES.map((s) => {
          const v = counts[s];
          const pct = (v / max) * 100;
          return (
            <div key={s} className="flex items-center gap-3 text-xs">
              <div className="w-36 text-gray-600 dark:text-gray-300 truncate">{s}</div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 relative overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: STAGE_FILL[s] }}
                />
              </div>
              <div className="w-8 text-right text-gray-900 font-medium tabular-nums dark:text-white">{v}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
