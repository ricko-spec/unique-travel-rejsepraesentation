"use client";

import { useMemo, useState } from "react";
import type { Trip } from "@/lib/types";

const MAX_INTRO_LEN = 500;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bløde brand-advarsler: intro skal være en stemnings-teaser om destinationen,
// ikke et hotel-katalog. Vi BLOKERER aldrig — vi gør blot sælgeren opmærksom.
// Hotelnavne/kundenavne slås op i denne trips egne data, så vi kun advarer om
// noget der faktisk hører hjemme et andet sted på siden.
function computeWarnings(text: string, data: Trip): string[] {
  const warnings: string[] = [];
  if (!text.trim()) return warnings;
  const lower = text.toLowerCase();

  // Hotelnavne (inkl. sub-hoteller på pakke-rejser)
  const hotelNames = new Set<string>();
  for (const h of data.hotels ?? []) {
    if (h.name && h.name.trim().length >= 3) hotelNames.add(h.name.trim());
    for (const s of h.subHotels ?? []) {
      if (s.name && s.name.trim().length >= 3) hotelNames.add(s.name.trim());
    }
  }
  for (const name of hotelNames) {
    if (lower.includes(name.toLowerCase())) {
      warnings.push(`Nævner muligvis et hotelnavn: «${name}» — hører til hotel-sektionen.`);
    }
  }

  // Kundenavne — udtræk navne-tokens fra travellers + customer_name og tjek tekst.
  const stop = new Set([
    "voksne", "voksen", "børn", "barn", "år", "andre", "og", "samt",
  ]);
  const nameSource = `${data.travellers ?? ""}`;
  const tokens = new Set<string>();
  for (const tok of nameSource.split(/[^\p{L}]+/u)) {
    if (tok.length >= 3 && !stop.has(tok.toLowerCase()) && /^\p{Lu}/u.test(tok)) {
      tokens.add(tok);
    }
  }
  for (const tok of tokens) {
    if (new RegExp(`\\b${escapeRegExp(tok)}\\b`, "iu").test(text)) {
      warnings.push(`Nævner muligvis et kundenavn: «${tok}» — intro'en skal være upersonlig.`);
      break; // én samlet advarsel om kundenavne er nok
    }
  }

  // Dag/nat-tal — står allerede i undertitlen
  if (
    /\b\d+\s*(nat|nætter|dage?|døgn)\b/iu.test(text) ||
    /\bnætter\b/iu.test(text) ||
    /\bnat\b/iu.test(text)
  ) {
    warnings.push("Indeholder dag/nat-tal — det står allerede i undertitlen.");
  }

  // Måltidsplaner
  if (/all\s*inclusive/iu.test(text) || /halvpension/iu.test(text) || /helpension/iu.test(text)) {
    warnings.push("Nævner en måltidsplan (fx «all inclusive») — hører til hotel-sektionen.");
  }

  return warnings;
}

export function TripDetail({
  id,
  slug,
  bookingNo,
  destination,
  customerName,
  data,
}: {
  id: string;
  slug: string;
  bookingNo: string;
  destination: string;
  customerName: string | null;
  data: Trip;
}) {
  const initialIntro = data.intro ?? "";
  const introOriginal = data.introOriginal ?? "";
  const [intro, setIntro] = useState(initialIntro);
  const [savedIntro, setSavedIntro] = useState(initialIntro);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 409 fra serveren: en anden har ændret rejsen imens — kræver reload.
  const [conflict, setConflict] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const warnings = useMemo(() => computeWarnings(intro, data), [intro, data]);
  const over = intro.length > MAX_INTRO_LEN;
  const dirty = intro !== savedIntro;
  const canRestore = introOriginal.length > 0 && introOriginal !== intro;

  async function save() {
    setError(null);
    setConflict(false);
    setSaving(true);
    const res = await fetch(`/admin/api/trips/${id}/intro`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intro }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Kunne ikke gemme" }));
      setError(j.error ?? "Kunne ikke gemme");
      if (res.status === 409) setConflict(true);
      return;
    }
    setSavedIntro(intro);
    setToast("Intro gemt");
    setTimeout(() => setToast(null), 2400);
  }

  function copyCustomerLink() {
    const url = `${window.location.origin}/${slug}`;
    void navigator.clipboard.writeText(url);
    setToast("Kundelink kopieret");
    setTimeout(() => setToast(null), 2400);
  }

  return (
    <div className="admin-shell">
      <div className="admin-wrap">
        <div className="admin-header">
          <div>
            <div className="admin-title">{destination}</div>
            <div className="admin-sub">
              #{bookingNo} · {customerName ?? data.travellers ?? "—"}
            </div>
          </div>
          <a className="admin-btn admin-btn-secondary" href="/admin">
            Tilbage
          </a>
        </div>

        {/* Overview: kundelink + kode */}
        <div className="admin-card">
          <h2>Overblik</h2>
          <div className="admin-link-box">
            <code>/{slug}</code>
            <button className="admin-btn admin-btn-secondary" onClick={copyCustomerLink}>
              Kopiér kundelink
            </button>
          </div>
          <p style={{ fontSize: 13, color: "var(--grey-text)" }}>
            Adgangskode til kunden: <strong style={{ fontFamily: "ui-monospace, monospace" }}>{bookingNo}</strong>
          </p>
        </div>

        {/* Intro-editor */}
        <div className="admin-card">
          <h2>Intro-tekst</h2>
          {error && (
            <div className="admin-error">
              {error}
              {conflict && (
                <div style={{ marginTop: 10 }}>
                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={() => window.location.reload()}
                  >
                    Genindlæs siden
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="admin-brandrules">
            <strong>Hold brand-stilen — ens for alle sælgere.</strong> Teksten er en
            stemnings-teaser om <em>destinationen</em>, ikke et hotel-katalog. Brug den til
            at rette småfejl (sprog, nuancer).
            <div className="admin-brandrules-cols">
              <div>
                <span className="admin-brandrules-yes">JA</span> områder, byer, ruten,
                natur, stemning, generelle oplevelser
              </div>
              <div>
                <span className="admin-brandrules-no">NEJ</span> kundenavn, hotelnavne,
                værelsestyper, måltidsplaner, dage/nat-tal
              </div>
            </div>
          </div>

          <textarea
            className="admin-input admin-textarea"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={7}
            placeholder="Velkommen til …"
          />

          <div className="admin-charcount" style={{ color: over ? "#c33" : "var(--grey-text)" }}>
            {intro.length} / {MAX_INTRO_LEN} tegn
            {over && " — for lang, kan ikke gemmes"}
          </div>

          {warnings.length > 0 && (
            <div className="admin-warn">
              <strong>Tjek brand-stilen:</strong>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <span className="admin-warn-note">
                Kun en venlig påmindelse — du kan gemme alligevel hvis det er bevidst.
              </span>
            </div>
          )}

          <div className="admin-actions-row">
            <button className="admin-btn" onClick={save} disabled={saving || over || !dirty}>
              {saving ? "Gemmer..." : "Gem"}
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={() => setIntro(savedIntro)}
              disabled={saving || !dirty}
            >
              Annullér
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={() => setIntro(introOriginal)}
              disabled={saving || !canRestore}
              title={
                introOriginal.length === 0
                  ? "Original AI-tekst er ikke gemt for denne rejse (oprettet før funktionen)"
                  : "Sæt teksten tilbage til den oprindelige AI-genererede intro"
              }
            >
              Gendan AI-tekst
            </button>
          </div>

          {data.introEditedBy && (
            <p style={{ fontSize: 12, color: "var(--grey-text)", marginTop: 10 }}>
              Sidst redigeret af {data.introEditedBy}
              {data.introEditedAt
                ? ` · ${new Date(data.introEditedAt).toLocaleString("da-DK")}`
                : ""}
            </p>
          )}
        </div>

        {/* Fremtidige felt-redigeringer (hotel-links, dato-noter, hero-override)
            tilføjes som nye .admin-card-sektioner her. */}
      </div>

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
