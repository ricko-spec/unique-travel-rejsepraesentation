"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";

type TripListItem = {
  id: string;
  booking_no: string;
  slug: string;
  destination: string;
  customer_name: string | null;
  hero_photo: string | null;
  active: boolean;
  created_at: string;
};

export function AdminDashboard() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);

  // Form state for create
  const [heroPhoto, setHeroPhoto] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [wasUpdate, setWasUpdate] = useState(false);

  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTrips();
  }, []);

  async function loadTrips() {
    setLoadingList(true);
    const res = await fetch("/admin/api/trips");
    if (res.ok) {
      const j = await res.json();
      setTrips(j.trips ?? []);
    }
    setLoadingList(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function handleParse(f: File) {
    setParseError(null);
    setTrip(null);
    setCreatedSlug(null);
    setWasUpdate(false);
    setParsing(true);
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/admin/api/parse", { method: "POST", body: fd });
    setParsing(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Parsing fejlede" }));
      const baseMsg = j.error ?? "Parsing fejlede";
      const issues: { path: string; message: string }[] | undefined = j.issues;
      const detail = issues?.length
        ? ` — ${issues.map((i) => `${i.path || "(rod)"}: ${i.message}`).join("; ")}`
        : "";
      setParseError(baseMsg + detail);
      return;
    }
    const j = await res.json();
    setTrip(j.trip as Trip);
    setCustomerName((j.trip as Trip).travellers ?? "");
    setSlugOverride((j.trip as Trip).bookingNo ?? "");
  }

  function onFileSelected(f: File | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setParseError("Filen skal være en PDF");
      return;
    }
    setFile(f);
    handleParse(f);
  }

  async function handleCreate() {
    if (!trip) return;
    setCreateError(null);
    setCreating(true);
    const res = await fetch("/admin/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        trip,
        heroPhoto: heroPhoto.trim() || null,
        customerName: customerName.trim() || null,
        slugOverride: slugOverride.trim() || null,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Oprettelse fejlede" }));
      const parts = [j.error ?? "Oprettelse fejlede"];
      if (j.hint) parts.push(`Hint: ${j.hint}`);
      if (j.code) parts.push(`Kode: ${j.code}`);
      setCreateError(parts.join(" — "));
      console.error("[create] Server response", j);
      return;
    }
    const j = await res.json();
    setCreatedSlug(j.slug);
    setWasUpdate(!!j.updated);
    showToast(j.updated ? "Præsentation opdateret" : "Præsentation oprettet");
    loadTrips();
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/admin/api/trips/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !current }),
    });
    if (res.ok) {
      showToast(current ? "Deaktiveret" : "Aktiveret");
      loadTrips();
    }
  }

  async function logout() {
    await fetch("/admin/api/auth", { method: "DELETE" });
    router.refresh();
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/${slug}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link kopieret"));
  }

  function resetUpload() {
    setFile(null);
    setTrip(null);
    setParseError(null);
    setCreateError(null);
    setCreatedSlug(null);
    setWasUpdate(false);
    setHeroPhoto("");
    setCustomerName("");
    setSlugOverride("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const newLink = createdSlug
    ? typeof window !== "undefined"
      ? `${window.location.origin}/${createdSlug}`
      : `/${createdSlug}`
    : null;

  return (
    <div className="admin-shell">
      <div className="admin-wrap">
        <div className="admin-header">
          <div>
            <div className="admin-title">Rejsepræsentationer</div>
            <div className="admin-sub">Unique Travel · Administration</div>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={logout}>
            Log ud
          </button>
        </div>

        <div className="admin-card">
          <h2>Ny præsentation</h2>

          {!trip && !parsing && (
            <>
              {parseError && <div className="admin-error">{parseError}</div>}
              <div
                className={`admin-dropzone ${dragging ? "dragging" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFileSelected(f);
                }}
              >
                <p>
                  <strong>Træk en PDF herhen</strong> eller klik for at vælge
                </p>
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--grey-text)" }}>
                  TravelWire-rejseplan, max 10 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                />
              </div>
            </>
          )}

          {parsing && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <span className="admin-spinner" />
              <span style={{ color: "var(--grey-text)" }}>
                Parser rejseplan med Claude — det tager 20-40 sekunder...
              </span>
            </div>
          )}

          {trip && !createdSlug && (() => {
            const existing = trips.find((t) => t.booking_no === trip.bookingNo);
            return (
            <>
              {createError && <div className="admin-error">{createError}</div>}
              {existing && (
                <div className="admin-success" style={{ background: "#fbf2dc", borderLeftColor: "var(--gold-soft)", color: "#5a4520" }}>
                  Booking #{trip.bookingNo} findes allerede ({existing.destination}
                  {existing.customer_name ? `, ${existing.customer_name}` : ""}). Den eksisterende præsentation bliver opdateret — det samme link genbruges{existing.active ? "" : " og bliver genaktiveret"}.
                </div>
              )}
              <div style={{ marginBottom: 16, padding: 14, background: "rgba(0,78,80,0.04)", borderRadius: 2 }}>
                <div style={{ fontFamily: "var(--font-cormorant), serif", fontStyle: "italic", fontSize: 22, color: "var(--rainforest)" }}>
                  {trip.destination}
                </div>
                <div style={{ fontSize: 13, color: "var(--grey-text)", marginTop: 4 }}>
                  {trip.subtitle} · {trip.departure} – {trip.return}
                </div>
                <div style={{ fontSize: 12, color: "var(--grey-text)", marginTop: 6 }}>
                  Booking #{trip.bookingNo} · {trip.travellers} · {trip.advisor}
                </div>
                <div style={{ fontSize: 12, color: "var(--grey-text)", marginTop: 6 }}>
                  {trip.itinerary.length} elementer i rejseplan · {trip.hotels.length} hoteller
                </div>
              </div>

              <div className="admin-form-grid">
                <div className="admin-form-row">
                  <label className="admin-label">Link-slug (i URL)</label>
                  <input
                    className="admin-input"
                    value={slugOverride}
                    onChange={(e) => setSlugOverride(e.target.value)}
                    placeholder={trip.bookingNo}
                  />
                </div>
                <div className="admin-form-row">
                  <label className="admin-label">Kundenavn (internt)</label>
                  <input
                    className="admin-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="fx Susanne og Finn Bastegaard"
                  />
                </div>
              </div>

              <div className="admin-form-row">
                <label className="admin-label">Hero-foto URL</label>
                <input
                  className="admin-input"
                  value={heroPhoto}
                  onChange={(e) => setHeroPhoto(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                />
                {heroPhoto && (
                  <img
                    src={heroPhoto}
                    alt=""
                    className="admin-preview-hero"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>

              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--grey-text)", textTransform: "uppercase", letterSpacing: "0.18em" }}>
                  Vis råt JSON
                </summary>
                <textarea
                  className="admin-textarea"
                  readOnly
                  value={JSON.stringify(trip, null, 2)}
                  style={{ marginTop: 8, minHeight: 240 }}
                />
              </details>

              <div className="admin-actions-row">
                <button className="admin-btn" disabled={creating} onClick={handleCreate}>
                  {creating
                    ? existing
                      ? "Opdaterer..."
                      : "Opretter..."
                    : existing
                    ? "Opdater præsentation"
                    : "Opret præsentation"}
                </button>
                <button className="admin-btn admin-btn-secondary" onClick={resetUpload}>
                  Annullér
                </button>
              </div>
            </>
            );
          })()}

          {createdSlug && newLink && (
            <>
              <div className="admin-success">
                {wasUpdate ? "Præsentation opdateret" : "Præsentation oprettet"}
              </div>
              <div className="admin-link-box">
                <code>{newLink}</code>
                <button className="admin-btn" onClick={() => copyLink(createdSlug)}>
                  Kopiér link
                </button>
              </div>
              <div className="admin-actions-row">
                <a className="admin-btn admin-btn-secondary" href={`/${createdSlug}`} target="_blank" rel="noreferrer">
                  Åbn præsentationen
                </a>
                <button className="admin-btn admin-btn-secondary" onClick={resetUpload}>
                  Opret en ny
                </button>
              </div>
            </>
          )}
        </div>

        <div className="admin-card">
          <h2>Alle præsentationer</h2>
          {loadingList ? (
            <div style={{ color: "var(--grey-text)", fontSize: 13 }}>
              <span className="admin-spinner" />
              Henter...
            </div>
          ) : trips.length === 0 ? (
            <div style={{ color: "var(--grey-text)", fontSize: 13 }}>Ingen præsentationer endnu.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Destination</th>
                    <th>Kunde</th>
                    <th>Oprettet</th>
                    <th>Status</th>
                    <th>Handlinger</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: "ui-monospace, monospace" }}>#{t.booking_no}</td>
                      <td>{t.destination}</td>
                      <td style={{ color: "var(--grey-text)" }}>{t.customer_name ?? "—"}</td>
                      <td style={{ color: "var(--grey-text)" }}>
                        {new Date(t.created_at).toLocaleDateString("da-DK")}
                      </td>
                      <td>
                        {t.active ? (
                          <span className="admin-status-active">Aktiv</span>
                        ) : (
                          <span className="admin-status-inactive">Deaktiveret</span>
                        )}
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="admin-btn admin-btn-secondary"
                            onClick={() => copyLink(t.slug)}
                            style={{ borderColor: "rgba(0,78,80,0.5)", color: "var(--rainforest)" }}
                          >
                            Kopiér link
                          </button>
                          <a
                            href={`/${t.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-btn admin-btn-secondary"
                            style={{ borderColor: "rgba(0,78,80,0.5)", color: "var(--rainforest)" }}
                          >
                            Åbn
                          </a>
                          <button
                            className="admin-btn admin-btn-danger"
                            onClick={() => toggleActive(t.id, t.active)}
                          >
                            {t.active ? "Deaktivér" : "Aktivér"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
