"use client";

import { useState } from "react";
import type { Profile } from "@/lib/profiles";

export function ProfileEditor({
  email,
  initialProfile,
}: {
  email: string;
  initialProfile: Profile | null;
}) {
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? "");
  const [phone, setPhone] = useState(initialProfile?.phone ?? "");
  const [advisorMatch, setAdvisorMatch] = useState(
    initialProfile?.advisor_match_name ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/admin/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        phone,
        advisor_match_name: advisorMatch,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Kunne ikke gemme" }));
      setError(j.error ?? "Kunne ikke gemme");
      return;
    }
    setToast("Profil gemt");
    setTimeout(() => setToast(null), 2400);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (!currentPassword) {
      setPwError("Indtast din nuværende adgangskode");
      return;
    }
    if (password.length < 6) {
      setPwError("Adgangskoden skal være mindst 6 tegn");
      return;
    }
    if (password !== confirm) {
      setPwError("De to adgangskoder er ikke ens");
      return;
    }
    setPwSaving(true);
    const res = await fetch("/admin/api/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, password }),
    });
    setPwSaving(false);
    if (!res.ok) {
      const j = await res
        .json()
        .catch(() => ({ error: "Kunne ikke skifte adgangskode" }));
      setPwError(j.error ?? "Kunne ikke skifte adgangskode");
      return;
    }
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setToast("Adgangskode skiftet");
    setTimeout(() => setToast(null), 2400);
  }

  return (
    <div className="admin-shell">
      <div className="admin-wrap">
        <div className="admin-header">
          <div>
            <div className="admin-title">Min profil</div>
            <div className="admin-sub">Unique Travel · Administration</div>
          </div>
          <a className="admin-btn admin-btn-secondary" href="/admin">
            Tilbage
          </a>
        </div>

        <div className="admin-card">
          <h2>Mine oplysninger</h2>
          {error && <div className="admin-error">{error}</div>}

          <form onSubmit={save}>
            <div className="admin-form-row">
              <label className="admin-label" htmlFor="email">
                Email (login)
              </label>
              <input
                id="email"
                className="admin-input"
                type="email"
                value={email}
                readOnly
                disabled
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label" htmlFor="full_name">
                Fulde navn
              </label>
              <input
                id="full_name"
                className="admin-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="fx Ricko Bastegaard"
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label" htmlFor="phone">
                Telefon
              </label>
              <input
                id="phone"
                className="admin-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="fx +45 59 49 86 30"
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label" htmlFor="advisor_match_name">
                Rådgivernavn i rejseplaner
              </label>
              <input
                id="advisor_match_name"
                className="admin-input"
                value={advisorMatch}
                onChange={(e) => setAdvisorMatch(e.target.value)}
                placeholder="fx Gustav Gotfredsen"
              />
              <p style={{ fontSize: 12, color: "var(--grey-text)", marginTop: 6 }}>
                Skal matche præcis det navn der står som rådgiver i TravelWire-PDF&apos;erne.
                Det bruges til at vise din email og telefon på kundens rejseside.
              </p>
            </div>

            <div className="admin-actions-row">
              <button type="submit" className="admin-btn" disabled={saving}>
                {saving ? "Gemmer..." : "Gem profil"}
              </button>
            </div>
          </form>
        </div>

        <div className="admin-card">
          <h2>Skift adgangskode</h2>
          {pwError && <div className="admin-error">{pwError}</div>}

          <form onSubmit={changePassword}>
            <div className="admin-form-row">
              <label className="admin-label" htmlFor="current_password">
                Nuværende adgangskode
              </label>
              <input
                id="current_password"
                className="admin-input"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Din nuværende adgangskode"
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label" htmlFor="new_password">
                Nyt password
              </label>
              <input
                id="new_password"
                className="admin-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindst 6 tegn"
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label" htmlFor="confirm_password">
                Bekræft nyt password
              </label>
              <input
                id="confirm_password"
                className="admin-input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Gentag adgangskoden"
              />
            </div>

            <div className="admin-actions-row">
              <button type="submit" className="admin-btn" disabled={pwSaving}>
                {pwSaving ? "Gemmer..." : "Skift adgangskode"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
