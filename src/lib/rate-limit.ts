import { getSupabaseService } from "@/lib/supabase/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export type RateLimitResult =
  | { allowed: true; remaining: number; attempts: number }
  | { allowed: false; retryAfterSeconds: number; attempts: number };

type IncrementRow = { count: number; reset_at: string };

/**
 * Generisk rate limiter backet af Supabase. `key` er typisk "{action}:{ip}:{resource}".
 *
 * Atomar increment sker i Postgres-funktionen `increment_rate_limit` (UPSERT): tæller
 * stiger inden for vinduet og nulstilles til 1 når vinduet er udløbet. Et succesfuldt
 * unlock må IKKE decremente/resette — derfor kaldes denne FØR kode-tjek og rører aldrig
 * tælleren bagefter.
 *
 * Fail-open: hvis rate-limit-systemet fejler (DB-hikke), lukker vi ægte kunder ind frem
 * for at låse alle ude.
 */
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const supabase = getSupabaseService();
  const now = new Date();
  const newResetAt = new Date(now.getTime() + WINDOW_MS);

  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_key: key,
    p_new_reset_at: newResetAt.toISOString(),
  });

  // `increment_rate_limit` er deklareret `returns table(...)`, så supabase-js giver et
  // array af rækker — ikke et enkelt objekt. Tag første række.
  const row: IncrementRow | undefined = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    console.error("[rate-limit] error, fail-open:", error);
    return { allowed: true, remaining: MAX_ATTEMPTS, attempts: 0 };
  }

  if (row.count > MAX_ATTEMPTS) {
    const resetAt = new Date(row.reset_at);
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    );
    return { allowed: false, retryAfterSeconds, attempts: row.count };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - row.count,
    attempts: row.count,
  };
}
