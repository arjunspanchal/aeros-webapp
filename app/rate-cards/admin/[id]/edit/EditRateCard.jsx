"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Card, Field, inputCls } from "@/app/calculator/_components/ui";
import CardHeaderForm from "./CardHeaderForm";
import ItemsEditor from "./ItemsEditor";

export default function EditRateCard({ initialCard, initialItems }) {
  const router = useRouter();
  const [card, setCard] = useState(initialCard);
  const [items, setItems] = useState(initialItems);
  const [deleting, setDeleting] = useState(false);

  async function deleteCard() {
    if (!confirm(`Delete rate card ${card.ref}? All its line items will be removed. This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/rate-cards/${card.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    router.push("/rate-cards");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <Link href="/rate-cards" className="hover:text-blue-600 dark:hover:text-blue-400">Rate Cards</Link>
            {" · "}{card.ref}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 dark:text-white">Edit rate card</h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Customer: <strong>{card.clientName || card.clientEmail}</strong> · Created {card.created ? new Date(card.created).toLocaleDateString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/rate-cards/${card.id}`} className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white">Preview →</Link>
          <button onClick={deleteCard} disabled={deleting} className="text-sm text-red-500 hover:text-red-600 px-2">
            {deleting ? "Deleting…" : "Delete card"}
          </button>
        </div>
      </div>

      <CardHeaderForm card={card} onSaved={setCard} />

      <ItemsEditor cardId={card.id} items={items} onChanged={setItems} />
    </div>
  );
}
