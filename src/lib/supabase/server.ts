import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return { url, anonKey, serviceKey };
}

function validateUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL er ikke sat i .env.local");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL mangler https:// prefix (fik: "${url}")`);
  }
  try {
    new URL(url);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL er ikke en gyldig URL ("${url}")`);
  }
  return url.replace(/\/+$/, "");
}

// Decode a Supabase JWT (no signature check — we only need the claims for diagnostics).
type JwtClaims = {
  role?: string;
  ref?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  // Authentication Methods Reference — fx [{ method: "password" }] ved login,
  // [{ method: "otp" }] når sessionen kommer fra et recovery-/magic-link.
  amr?: { method?: string; timestamp?: number }[];
};

export function decodeJwtClaims(jwt: string | undefined): JwtClaims | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    // base64url → base64
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

// Guard: refuses to create a "service" client if the key isn't actually service_role.
// This converts "silent RLS denial at insert time" into "loud error at startup".
function assertServiceRoleKey(key: string): void {
  const claims = decodeJwtClaims(key);
  if (!claims) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY er ikke en gyldig JWT. Kopiér den fra Supabase → Settings → API → service_role.",
    );
  }
  if (claims.role !== "service_role") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY har role="${claims.role ?? "ukendt"}" — forventet "service_role". ` +
        "Det er sandsynligvis anon-nøglen der ved en fejl er sat ind. " +
        "Hent service_role-nøglen i Supabase → Settings → API → \"service_role\" (ikke anon).",
    );
  }
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY er udløbet — generér en ny i Supabase Settings → API.");
  }
}

export function getSupabaseAnon(): SupabaseClient {
  const { url, anonKey } = readEnv();
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY er ikke sat i .env.local");
  }
  return createClient(validateUrl(url), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getSupabaseService(): SupabaseClient {
  const { url, serviceKey } = readEnv();
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY er ikke sat i .env.local");
  }
  assertServiceRoleKey(serviceKey);

  // Be explicit: pass the key as both apikey and Authorization so no
  // intermediate (cache, dev proxy, hot-reload) can downgrade it.
  return createClient(validateUrl(url), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  });
}

export function envDiagnostics() {
  const { url, anonKey, serviceKey } = readEnv();
  let host: string | null = null;
  let urlError: string | null = null;
  try {
    if (url) host = new URL(url).host;
  } catch (e) {
    urlError = e instanceof Error ? e.message : String(e);
  }

  const anonClaims = decodeJwtClaims(anonKey);
  const serviceClaims = decodeJwtClaims(serviceKey);

  return {
    NEXT_PUBLIC_SUPABASE_URL: {
      present: !!url,
      host,
      hasProtocol: url ? /^https?:\/\//i.test(url) : false,
      trailingSlash: url ? /\/+$/.test(url) : false,
      length: url?.length ?? 0,
      urlError,
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      present: !!anonKey,
      length: anonKey?.length ?? 0,
      role: anonClaims?.role ?? null,
      projectRef: anonClaims?.ref ?? null,
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      present: !!serviceKey,
      length: serviceKey?.length ?? 0,
      role: serviceClaims?.role ?? null,
      projectRef: serviceClaims?.ref ?? null,
      // Flag the common paste-error: keys identical.
      sameAsAnon: !!anonKey && !!serviceKey && anonKey === serviceKey,
      isServiceRole: serviceClaims?.role === "service_role",
      expired: serviceClaims?.exp ? serviceClaims.exp * 1000 < Date.now() : false,
    },
  };
}

export function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts: string[] = [e.message];
  let cause: unknown = (e as Error & { cause?: unknown }).cause;
  let depth = 0;
  while (cause && depth < 4) {
    if (cause instanceof Error) {
      const code = (cause as Error & { code?: string }).code;
      parts.push(code ? `${cause.message} [${code}]` : cause.message);
      cause = (cause as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(cause));
      break;
    }
    depth++;
  }
  return parts.join(" → ");
}
