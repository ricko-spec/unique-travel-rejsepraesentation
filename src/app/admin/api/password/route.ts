import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/auth";
import { getSupabaseAnon, getSupabaseService } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit, requestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  currentPassword: z.string().min(1, "Indtast din nuværende adgangskode"),
  password: z.string().min(6, "Adgangskoden skal være mindst 6 tegn"),
});

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Ugyldige data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const actor = `admin:${user.email}`;
  const service = getSupabaseService();
  const { ip } = requestMeta();

  // Rate-limit FØR verifikation af nuværende kode — med kravet om nuværende
  // kode er dette en gætte-flade (kapret session kan ellers brute-force sig
  // til permanent konto-overtagelse). Samme budget som login: 10 / 15 min.
  const rl = await checkRateLimit(`pwchange:${ip}`);
  if (!rl.allowed) {
    await writeAudit(service, {
      actor,
      action: "password_change_rate_limited",
      resource: "password",
      metadata: { attempt_count: rl.attempts },
    });
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `For mange forsøg. Prøv igen om ${minutes} minutter.` },
      { status: 429 },
    );
  }

  // Verificér nuværende adgangskode med en session-løs anon-klient —
  // signInWithPassword på session-klienten ville rotere brugerens cookies.
  const verifier = getSupabaseAnon();
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    await writeAudit(service, {
      actor,
      action: "password_change_failed",
      resource: "password",
      metadata: { attempt_count: rl.attempts, reason: "wrong_current_password" },
    });
    return NextResponse.json(
      { error: "Nuværende adgangskode er forkert" },
      { status: 400 },
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
      metadata: { attempt_count: rl.attempts, reason: "update_error" },
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAudit(service, {
    actor,
    action: "password_changed",
    resource: "password",
    metadata: { attempt_count: rl.attempts },
  });
  return NextResponse.json({ ok: true });
}
