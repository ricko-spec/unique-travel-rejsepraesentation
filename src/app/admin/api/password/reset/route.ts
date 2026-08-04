import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/auth";
import { getSupabaseService, decodeJwtClaims } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit, requestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  password: z.string().min(6, "Adgangskoden skal være mindst 6 tegn"),
});

const INVALID_LINK =
  "Linket er udløbet eller ugyldigt. Bed om en ny nulstillingsmail.";

// Sætter ny adgangskode fra en recovery-session (nulstillingslink i mail).
// Kræver IKKE nuværende adgangskode — derfor er endpointet gated på at
// sessionen faktisk kommer fra et recovery-/OTP-link (amr-claim i JWT'en).
// En almindelig password-session afvises, så kravet om nuværende kode i
// PATCH /admin/api/password ikke kan omgås med en kapret session.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Ugyldige data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
  }

  const actor = `admin:${user.email}`;
  const service = getSupabaseService();
  const { ip } = requestMeta();

  // Samme budget som det almindelige password-skift: 10 / 15 min pr. IP.
  const rl = await checkRateLimit(`pwchange:${ip}`);
  if (!rl.allowed) {
    await writeAudit(service, {
      actor,
      action: "password_change_rate_limited",
      resource: "password",
      metadata: { attempt_count: rl.attempts, via: "recovery" },
    });
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `For mange forsøg. Prøv igen om ${minutes} minutter.` },
      { status: 429 },
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const amr = decodeJwtClaims(session?.access_token)?.amr ?? [];
  const isRecoverySession = amr.some((m) =>
    ["otp", "recovery", "magiclink"].includes(m.method ?? ""),
  );
  if (!isRecoverySession) {
    return NextResponse.json(
      {
        error:
          "Denne session kommer ikke fra et nulstillingslink. Brug 'Skift adgangskode' under Min profil.",
      },
      { status: 403 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    await writeAudit(service, {
      actor,
      action: "password_change_failed",
      resource: "password",
      metadata: { attempt_count: rl.attempts, via: "recovery", reason: "update_error" },
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAudit(service, {
    actor,
    action: "password_changed",
    resource: "password",
    metadata: { attempt_count: rl.attempts, via: "recovery" },
  });

  // Recovery-sessionen er brugt — log ud, så brugeren logger ind med den nye kode.
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
