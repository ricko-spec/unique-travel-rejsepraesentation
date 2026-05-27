"use client";

import { useState, useTransition } from "react";
import { unlockTrip } from "./actions";

type Props = {
  slug: string;
  destination?: string;
};

export function AccessGate({ slug, destination }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await unlockTrip(slug, code);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <div className="text-center mb-6">
          <p className="text-xs tracking-widest uppercase text-stone-500 mb-3">
            Unique Travel
          </p>
          <h1 className="text-2xl font-serif text-stone-900 mb-2">
            {destination
              ? `Jeres rejse til ${destination}`
              : "Jeres rejse venter"}
          </h1>
          <p className="text-sm text-stone-600">
            Indtast jeres adgangskode for at se rejseplanen.
          </p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="access-code"
              className="block text-xs uppercase tracking-wider text-stone-500 mb-2"
            >
              Adgangskode
            </label>
            <input
              id="access-code"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Booking-nummer"
              className="w-full px-4 py-3 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
              required
              disabled={pending}
            />
            <p className="mt-2 text-xs text-stone-500">
              Find koden i jeres email fra Unique Travel.
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !code.trim()}
            className="w-full bg-stone-900 text-white font-medium py-3 rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Tjekker..." : "Se rejsen"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-stone-500">
          Spørgsmål? Kontakt jeres rejserådgiver hos Unique Travel.
        </p>
      </div>
    </main>
  );
}
