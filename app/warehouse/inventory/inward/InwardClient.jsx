"use client";

import { useState } from "react";
import MovementForm from "../MovementForm";
import RecentMovementsTable from "../RecentMovementsTable";

export default function InwardClient({ items, locations, initialRecent }) {
  const [recent, setRecent] = useState(initialRecent);

  async function refreshRecent() {
    try {
      const res = await fetch("/api/warehouse/movements?type=inward&limit=20");
      const data = await res.json();
      if (res.ok) setRecent(data.movements || []);
    } catch {}
  }

  return (
    <div className="space-y-8">
      <MovementForm
        kind="inward"
        items={items}
        locations={locations}
        onPosted={refreshRecent}
      />
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
          Recent inwards
        </h2>
        <RecentMovementsTable rows={recent} />
      </section>
    </div>
  );
}
