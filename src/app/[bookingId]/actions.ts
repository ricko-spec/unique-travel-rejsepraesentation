"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export type UnlockResult = { error: string } | void;

type AuditEntry = {
  action: string;
  resource: string;
  ip: string;
  userAgent: string | null;
  metadata?: Record<string, unknown>;
};

// Best-effort audit-logning: må aldrig blokere eller crashe unlock (konsistent med
// fail-open-princippet for rate limiting). Fejl logges men sluges.
async function writeAudit(
  supabase: SupabaseClient,
  slug: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_log").insert({
      actor: `customer:${slug}`,
      action: entry.action,
      resource: entry.resource,
      ip: entry.ip,
      user_agent: entry.userAgent,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      console.error("[audit] insert error:", error);
    }
  } catch (e) {
    console.error("[audit] insert threw:", e);
  }
}

export async function unlockTrip(
  slug: string,
  code: string,
): Promise<UnlockResult> {
  const cleanCode = (code || "").trim();
  if (!cleanCode) {
    return { error: "Indtast venligst en kode." };
  }

  const headerList = headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = headerList.get("user-agent");

  const supabase = getSupabaseService();

  const rl = await checkRateLimit(`unlock:${ip}:${slug}`);
  if (!rl.allowed) {
    await writeAudit(supabase, slug, {
      action: "unlock_rate_limited",
      resource: slug,
      ip,
      userAgent,
      metadata: { attempt_count: rl.attempts },
    });
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60));
    return {
      error: `For mange forsøg. Prøv igen om ${minutes} minutter.`,
    };
  }

  const { data, error } = await supabase
    .from("trips")
    .select("booking_no")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    await writeAudit(supabase, slug, {
      action: "unlock_failed",
      resource: slug,
      ip,
      userAgent,
      metadata: { attempt_count: rl.attempts, reason: "trip_not_found" },
    });
    return { error: "Rejsen kunne ikke findes. Tjek venligst linket." };
  }

  if (data.booking_no !== cleanCode) {
    await writeAudit(supabase, slug, {
      action: "unlock_failed",
      resource: slug,
      ip,
      userAgent,
      metadata: { attempt_count: rl.attempts, reason: "wrong_code" },
    });
    return { error: "Forkert kode. Tjek venligst jeres email." };
  }

  // Log succes FØR redirect — redirect() smider en exception, så al logning skal ske inden.
  await writeAudit(supabase, slug, {
    action: "unlock_success",
    resource: slug,
    ip,
    userAgent,
    metadata: { attempt_count: rl.attempts },
  });

  cookies().set(`trip_access_${slug}`, data.booking_no, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/${slug}`,
    maxAge: 60 * 60 * 24 * 30, // 30 dage
  });

  redirect(`/${slug}`);
}
