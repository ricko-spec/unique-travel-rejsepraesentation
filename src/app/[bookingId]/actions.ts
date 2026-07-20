"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseService } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit, requestMeta } from "@/lib/audit";

export type UnlockResult = { error: string } | void;

export async function unlockTrip(
  slug: string,
  code: string,
): Promise<UnlockResult> {
  const cleanCode = (code || "").trim();
  if (!cleanCode) {
    return { error: "Indtast venligst en kode." };
  }

  const { ip } = requestMeta();
  const supabase = getSupabaseService();
  const actor = `customer:${slug}`;

  const rl = await checkRateLimit(`unlock:${ip}:${slug}`);
  if (!rl.allowed) {
    await writeAudit(supabase, {
      actor,
      action: "unlock_rate_limited",
      resource: slug,
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
    await writeAudit(supabase, {
      actor,
      action: "unlock_failed",
      resource: slug,
      metadata: { attempt_count: rl.attempts, reason: "trip_not_found" },
    });
    return { error: "Rejsen kunne ikke findes. Tjek venligst linket." };
  }

  if (data.booking_no !== cleanCode) {
    await writeAudit(supabase, {
      actor,
      action: "unlock_failed",
      resource: slug,
      metadata: { attempt_count: rl.attempts, reason: "wrong_code" },
    });
    return { error: "Forkert kode. Tjek venligst jeres email." };
  }

  // Log succes FØR redirect — redirect() smider en exception, så al logning skal ske inden.
  await writeAudit(supabase, {
    actor,
    action: "unlock_success",
    resource: slug,
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
