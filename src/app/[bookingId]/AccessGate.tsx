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
    <main className="min-h-screen flex items-center justify-center bg-sand-page px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-sand p-8 md:p-10">
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.2em] uppercase text-gold mb-3 font-medium">
            Unique Travel
          </p>
          <h1 className="font-serif text-3xl md:text-4xl text-rainforest mb-3 leading-tight">
            {destination
              ? `Jeres rejse til ${destination}`
              : "Jeres rejse venter"}
          </h1>
          <p className="text-sm text-grey-text">
            Indtast jeres adgangskode for at se rejseplanen.
          </p>
        </div>

        <form action={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="access-code"
              className="block text-xs uppercase tracking-wider text-rainforest/70 mb-2 font-medium"
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
              className="w-full px-4 py-3 border border-sand rounded-lg text-rainforest placeholder:text-grey-text/50 focus:outline-none focus:ring-2 focus:ring-rainforest/40 focus:border-rainforest transition-colors"
              required
              disabled={pending}
            />
            <p className="mt-2 text-xs text-grey-text">
              Find koden i jeres email fra Unique Travel.
            </p>
          </div>

          {error && (
            <div className="text-sm text-rust bg-rust/10 border border-rust/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !code.trim()}
            className="w-full bg-rainforest text-gold font-medium tracking-wider uppercase text-sm py-3 rounded-full hover:bg-rainforest-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Tjekker..." : "Se rejsen"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-grey-text">
          Spørgsmål? Kontakt jeres rejserådgiver hos Unique Travel.
        </p>
      </div>
    </main>
  );
}
