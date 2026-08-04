import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAnon, getSupabaseService } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit, requestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().email() });

// Svaret er ALTID det samme uanset om kontoen findes — ingen email-enumeration.
const GENERIC_MESSAGE =
  "Hvis kontoen findes, er der sendt en mail med et nulstillingslink.";

// Sender Supabase password-recovery-mail ("Glemt adgangskode?" på login-siden).
// Kræver ikke login. redirect_to peger på /admin/reset-password og SKAL stå i
// Supabase Auth' Redirect URL-allowlist — ellers falder GoTrue tilbage til
// Site URL og linket lander forkert.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Indtast en gyldig email" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const { ip } = requestMeta();
  const service = getSupabaseService();

  // Samme budget som login (10 / 15 min pr. IP) — recovery-mails er ellers en
  // gratis spam-/probe-flade.
  const rl = await checkRateLimit(`recovery:${ip}`);
  if (!rl.allowed) {
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `For mange forsøg. Prøv igen om ${minutes} minutter.` },
      { status: 429 },
    );
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const { error } = await getSupabaseAnon().auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/admin/reset-password`,
  });
  if (error) {
    // Logges kun internt — svaret til klienten er stadig det generiske.
    console.error("[recovery] resetPasswordForEmail error:", error.message);
  }

  await writeAudit(service, {
    actor: `admin:${email}`,
    action: "password_recovery_requested",
    resource: "password",
    metadata: { attempt_count: rl.attempts },
  });

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
