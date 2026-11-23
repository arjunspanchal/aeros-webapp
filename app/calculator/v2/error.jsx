"use client";
// If the calculator screen hits an error it did not expect, say so and offer a
// way back, instead of a blank page. Nothing is saved until Save is pressed, so
// reloading loses only what was typed.
import { Button } from "@/app/components/ui";

export default function CalculatorError({ error, reset }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-ink-800">
      <h1 className="text-xl font-semibold">The calculator hit a problem</h1>
      <p className="mt-2 text-sm text-ink-600">
        Nothing was saved. Try again; if it happens with the same inputs, note what you entered and report it.
      </p>
      {error?.message ? <p className="mt-3 rounded bg-ink-100 px-3 py-2 font-mono text-xs text-ink-600">{error.message}</p> : null}
      <div className="mt-5"><Button onClick={() => reset()}>Try again</Button></div>
    </div>
  );
}
