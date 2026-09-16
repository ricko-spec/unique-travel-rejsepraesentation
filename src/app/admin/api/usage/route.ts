import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { describeFetchError, getSupabaseService } from "@/lib/supabase/server";
import { summarizeUsage, type UsagePeriod } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PERIODS: UsagePeriod[] = ["7d", "30d", "all"];

// ISSUE-38: samme admin-session-gate som resten af systemet — ingen ny
// rollemodel. Fejler et af de to opslag, returnerer vi en fejl frem for
// falske nul-tal (integritetsprincippet i Issue #38).
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30d";
  const period: UsagePeriod = (VALID_PERIODS as string[]).includes(periodParam)
    ? (periodParam as UsagePeriod)
    : "30d";

  try {
    const supabase = getSupabaseService();
    const [profilesRes, eventsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase
        .from("upload_events")
        .select("id, user_id, actor_name, received_at, status, save_kind")
        .order("received_at", { ascending: false }),
    ]);

    if (profilesRes.error) {
      console.error("[GET /admin/api/usage] profiles error", profilesRes.error);
      return NextResponse.json(
        { error: `Kunne ikke hente sælgerprofiler: ${profilesRes.error.message}` },
        { status: 500 },
      );
    }
    if (eventsRes.error) {
      console.error("[GET /admin/api/usage] upload_events error", eventsRes.error);
      return NextResponse.json(
        { error: `Kunne ikke hente upload-data: ${eventsRes.error.message}` },
        { status: 500 },
      );
    }

    const summary = summarizeUsage(
      profilesRes.data ?? [],
      eventsRes.data ?? [],
      period,
      new Date(),
    );
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[GET /admin/api/usage] Threw", e);
    return NextResponse.json(
      { error: `Kunne ikke hente brugsdata: ${describeFetchError(e)}` },
      { status: 500 },
    );
  }
}
