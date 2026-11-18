"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHead, Notice, Segmented } from "../../_components/ui";
import MovementForm from "../_components/MovementForm";

export default function ManualClient({ items, locations, stock }) {
  const router = useRouter();
  const [kind, setKind] = useState("inward");
  const [msg, setMsg] = useState("");
  return (
    <div>
      <PageHead title="Manual entry" sub="Only for stock that moves with no Zoho invoice or purchase order behind it: returns, samples, scrap, opening stock."
        right={<Segmented value={kind} onChange={(v) => { setKind(v); setMsg(""); }} options={[{ value: "inward", label: "Stock in" }, { value: "outward", label: "Stock out" }]} />} />
      <Notice>Goods on a Zoho invoice or purchase order should be recorded on Outward or Inward, so the document is closed too.</Notice>
      {msg && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{msg}</p>}
      <MovementForm key={kind} kind={kind} items={items} locations={locations} stock={stock}
        onPosted={(m) => { setMsg(`Saved ${m?.movement_no || ""}.`); router.refresh(); }} />
    </div>
  );
}
