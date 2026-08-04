"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin({ notice }: { notice?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Supabase recovery-links kan lande her (Site URL) med tokens eller fejl i
  // URL-hash'en — send dem videre til reset-siden, som ejer det flow. Hash'en
  // når aldrig serveren, så viderestillingen SKAL ske client-side.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && /(access_token=|type=recovery|error_code=)/.test(hash)) {
      router.replace(`/admin/reset-password${hash}`);
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = await fetch("/admin/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Login fejlede" }));
      setError(j.error ?? "Login fejlede");
      return;
    }
    router.refresh();
  }

  async function sendRecoveryMail() {
    if (!email.trim()) {
      setInfo(null);
      setError("Skriv din email i feltet ovenfor, og tryk så på 'Glemt adgangskode?'");
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = await fetch("/admin/api/password/recovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setLoading(false);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error ?? "Kunne ikke sende nulstillingsmail. Prøv igen.");
      return;
    }
    setInfo(j?.message ?? "Hvis kontoen findes, er der sendt en mail med et nulstillingslink.");
  }

  // Rydder en evt. halv/dårlig session (fx et delvist brugt recovery-link),
  // så brugeren kan starte forfra med et rent login.
  async function resetSession() {
    setError(null);
    setInfo(null);
    await fetch("/admin/api/auth", { method: "DELETE" }).catch(() => {});
    setInfo("Sessionen er nulstillet. Log ind igen.");
    router.refresh();
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h1>Administration</h1>
        <div className="sub">Unique Travel</div>
        {notice && <div className="admin-success">{notice}</div>}
        {info && <div className="admin-success">{info}</div>}
        {error && <div className="admin-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="admin-form-row">
            <label className="admin-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="admin-input"
              type="email"
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="admin-form-row">
            <label className="admin-label" htmlFor="pw">
              Adgangskode
            </label>
            <input
              id="pw"
              className="admin-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="admin-btn" disabled={loading}>
            {loading ? "Logger ind..." : "Log ind"}
          </button>
        </form>
        <div className="admin-login-actions">
          <button
            type="button"
            className="admin-login-textlink"
            onClick={sendRecoveryMail}
            disabled={loading}
          >
            Glemt adgangskode?
          </button>
          <button
            type="button"
            className="admin-login-textlink"
            onClick={resetSession}
            disabled={loading}
          >
            Nulstil session / log ud
          </button>
        </div>
      </div>
    </div>
  );
}
