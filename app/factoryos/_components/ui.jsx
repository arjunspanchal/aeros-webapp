// Re-exports the calculator's UI primitives so we match style exactly.
// Plus order-specific helpers (stage badges, stage timelines).

export { inputCls, labelCls, Field, Card, Row, SectionHeader, Toggle, PillBtn, Header } from "@/app/calculator/_components/ui";
import { STAGES, STAGE_INDEX } from "@/lib/factoryos/constants";

const STAGE_COLORS = {
  "RM Pending": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "Under Printing": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "In Conversion": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  "Packing": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  "Ready for Dispatch": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  "Dispatched": "bg-green-600 text-white",
  "Delivered": "bg-teal-700 text-white",
};

export function StageBadge({ stage }) {
  const cls = STAGE_COLORS[stage] || "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {stage}
    </span>
  );
}

export function StageTimeline({ stage, stages = STAGES }) {
  // `stages` = this job's own flow (vendor-converted / vendor-packed jobs
  // skip steps); falls back to the full list.
  const idx = stages.indexOf(stage);
  const current = idx >= 0 ? idx : (STAGE_INDEX[stage] ?? 0);
  return (
    <div className="flex items-center gap-1 w-full">
      {stages.map((s, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        return (
          <div key={s} className="flex items-center flex-1 min-w-0">
            <div
              className={`h-2 rounded-full flex-1 transition-colors ${
                done ? (isCurrent ? "bg-blue-600" : "bg-blue-400") : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
            {i < stages.length - 1 && <div className="w-1" />}
          </div>
        );
      })}
    </div>
  );
}

export function formatDate(isoOrNull) {
  if (!isoOrNull) return "—";
  try {
    const d = new Date(isoOrNull);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function formatDateTime(isoOrNull) {
  if (!isoOrNull) return "—";
  try {
    const d = new Date(isoOrNull);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
