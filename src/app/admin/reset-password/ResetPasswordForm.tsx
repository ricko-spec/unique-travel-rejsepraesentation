"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const INVALID_LINK =
  "Linket er udløbet eller ugyldigt. Bed om en ny nulstillingsmail.";

type Phase = "checking" | "ready" | "invalid";

export function ResetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return; // StrictMode dobbelt-mount i dev
    ranOnce.current = true;

    async function establishSession() {
      const supabase = createBrowserSupabase();
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const cleanUrl = window.location.pathname;

      // GoTrue sender udløbne/ugyldige links tilbage som fejl i hash/query
      // (fx error_code=otp_expired) i stedet for tokens.
      if (hash.get("error") || query.get("error")) {
        window.history.replaceState(null, "", cleanUrl);
        setPhase("invalid");
        return;
      }

      // Implicit flow: tokens i URL-hash — det format både dashboardets
      // "Send password recovery" og appens egen recovery-mail lander med.
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", cleanUrl);
        setPhase(sessionError ? "invalid" : "ready");
        return;
      }

      // PKCE-fallback: ?code= i query (kræver samme browser som anmodningen).
      const code = query.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", cleanUrl);
        setPhase(exchangeError ? "invalid" : "ready");
        return;
      }

      // Ingen tokens i URL'en — måske er sessionen allerede etableret (fx
      // reload af siden efter at hash'en er konsumeret).
      const { data } = await supabase.auth.getUser();
      setPhase(data.user ? "ready" : "invalid");
    }

    establishSession();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Adgangskoden skal være mindst 6 tegn");
      return;
    }
    if (password !== confirm) {
      setError("De to adgangskoder er ikke ens");
      return;
    }
    setSaving(true);
    const res = await fetch("/admin/api/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);
    if (!res.ok) {
      if (res.status === 401) {
        setPhase("invalid");
        return;
      }
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "Kunne ikke opdatere adgangskoden. Prøv igen.");
      return;
    }
    router.replace("/admin?reset=ok");
    router.refresh();
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h1>Ny adgangskode</h1>
        <div className="sub">Unique Travel</div>

        {phase === "checking" && <p>Kontrollerer nulstillingslink…</p>}

        {phase === "invalid" && (
          <>
            <div className="admin-error">{INVALID_LINK}</div>
            <p>
              Gå til <a href="/admin">login-siden</a> og brug &quot;Glemt
              adgangskode?&quot; for at få en ny mail.
            </p>
          </>
        )}

        {phase === "ready" && (
          <>
            {error && <div className="admin-error">{error}</div>}
            <form onSubmit={submit}>
              <div className="admin-form-row">
                <label className="admin-label" htmlFor="new-pw">
                  Ny adgangskode
                </label>
                <input
                  id="new-pw"
                  className="admin-input"
                  type="password"
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="admin-form-row">
                <label className="admin-label" htmlFor="confirm-pw">
                  Gentag ny adgangskode
                </label>
                <input
                  id="confirm-pw"
                  className="admin-input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" className="admin-btn" disabled={saving}>
                {saving ? "Gemmer..." : "Gem ny adgangskode"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
