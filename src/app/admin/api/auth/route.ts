import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit, requestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email og adgangskode er påkrævet" }, { status: 400 });
  }

  const { ip } = requestMeta();
  const service = getSupabaseService();
  const actor = `admin:${email}`;

  // Rate-limit pr. IP på tværs af alle konti (10 forsøg / 15 min) — FØR
  // signInWithPassword, og et korrekt login decrementer aldrig tælleren
  // (samme princip som kunde-unlock i [bookingId]/actions.ts).
  const rl = await checkRateLimit(`login:${ip}`);
  if (!rl.allowed) {
    await writeAudit(service, {
      actor,
      action: "login_rate_limited",
      resource: "login",
      metadata: { attempt_count: rl.attempts },
    });
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `For mange loginforsøg. Prøv igen om ${minutes} minutter.` },
      { status: 429 },
    );
  }

  const supabase = createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await writeAudit(service, {
      actor,
      action: "login_failed",
      resource: "login",
      metadata: { attempt_count: rl.attempts },
    });
    return NextResponse.json({ error: "Forkert email eller adgangskode" }, { status: 401 });
  }

  await writeAudit(service, {
    actor,
    action: "login_success",
    resource: "login",
    metadata: { attempt_count: rl.attempts },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await createSessionClient().auth.signOut();
  return NextResponse.json({ ok: true });
}
