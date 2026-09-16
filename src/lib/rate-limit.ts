import { getSupabaseService } from "./supabase/server";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 10;

export type RateLimitResult =
  | { allowed: true; remaining: number; attempts: number }
  | { allowed: false; retryAfterSeconds: number; attempts: number };

type IncrementRow = { count: number; reset_at: string };

export type RateLimitOptions = {
  /** Vinduets længde i millisekunder. Default: 15 minutter (uændret for eksisterende kald). */
  windowMs?: number;
  /** Maks. forsøg inden for vinduet. Default: 10 (uændret for eksisterende kald). */
  maxAttempts?: number;
};

// Ren beslutningslogik — ingen DB-afhængighed, testbar direkte. Udskilt fra
// checkRateLimit() så Issue #54's "limit nået / under limit / vindue-reset"
// -cases kan testes uden en levende Supabase-forbindelse (samme princip som
// summarizeUsage i usage.ts).
export function evaluateRateLimit(
  row: IncrementRow,
  now: Date,
  maxAttempts: number,
): RateLimitResult {
  if (row.count > maxAttempts) {
    const resetAt = new Date(row.reset_at);
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    );
    return { allowed: false, retryAfterSeconds, attempts: row.count };
  }
  return {
    allowed: true,
    remaining: maxAttempts - row.count,
    attempts: row.count,
  };
}

/**
 * Generisk rate limiter backet af Supabase. `key` er typisk "{action}:{ip}:{resource}"
 * eller "{action}:{userId}" for autentificerede brugere.
 *
 * Atomar increment sker i Postgres-funktionen `increment_rate_limit` (UPSERT): tæller
 * stiger inden for vinduet og nulstilles til 1 når vinduet er udløbet. Et succesfuldt
 * forsøg (login/unlock/parse) må IKKE decremente/resette — derfor kaldes denne FØR det
 * beskyttede arbejde og rører aldrig tælleren bagefter.
 *
 * Fail-open: hvis rate-limit-systemet fejler (DB-hikke), lukker vi ægte brugere ind frem
 * for at låse alle ude.
 *
 * `options` er valgfri — udelades de, er adfærden 100% uændret ift. før parametriseringen
 * (15 min / 10 forsøg), så alle eksisterende kald (login, password, unlock) er upåvirkede.
 */
export async function checkRateLimit(
  key: string,
  options?: RateLimitOptions,
): Promise<RateLimitResult> {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const supabase = getSupabaseService();
  const now = new Date();
  const newResetAt = new Date(now.getTime() + windowMs);

  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_key: key,
    p_new_reset_at: newResetAt.toISOString(),
  });

  // `increment_rate_limit` er deklareret `returns table(...)`, så supabase-js giver et
  // array af rækker — ikke et enkelt objekt. Tag første række.
  const row: IncrementRow | undefined = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    console.error("[rate-limit] error, fail-open:", error);
    return { allowed: true, remaining: maxAttempts, attempts: 0 };
  }

  return evaluateRateLimit(row, now, maxAttempts);
}
