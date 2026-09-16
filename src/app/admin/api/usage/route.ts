import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { describeFetchError, getSupabaseService } from "@/lib/supabase/server";
import {
  fetchUsagePeriodSummary,
  mergeUsageSummary,
  periodStart,
  type UsagePeriod,
} from "@/lib/usage";

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
    const startIso = periodStart(period, new Date());

    // ISSUE-38-reviewfund: en tidligere revision hentede ALLE upload_events
    // til Node.js (først et enkelt .select(), så uuid-keyset-paginering) og
    // aggregerede i TypeScript. Begge dele havde konsistensproblemer — se
    // den fulde begrundelse i supabase/009_upload_events.sql ved
    // usage_period_summary(). RPC'en kører som ét SQL-statement og
    // returnerer et allerede-aggregeret, indbyrdes konsistent resultat
    // (bundet af antal aktive sælgere, ikke antal events). profiles er
    // adskilt bundet af antal sælgere (i praksis under 10) og har ingen
    // tilsvarende risiko.
    const [profilesRes, aggregate] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      fetchUsagePeriodSummary(startIso),
    ]);

    if (profilesRes.error) {
      console.error("[GET /admin/api/usage] profiles error", profilesRes.error);
      return NextResponse.json(
        { error: `Kunne ikke hente sælgerprofiler: ${profilesRes.error.message}` },
        { status: 500 },
      );
    }

    const summary = mergeUsageSummary(profilesRes.data ?? [], aggregate, period, startIso);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[GET /admin/api/usage] Threw", e);
    return NextResponse.json(
      { error: `Kunne ikke hente brugsdata: ${describeFetchError(e)}` },
      { status: 500 },
    );
  }
}
