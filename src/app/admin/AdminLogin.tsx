"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h1>Administration</h1>
        <div className="sub">Unique Travel</div>
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
      </div>
    </div>
  );
}
