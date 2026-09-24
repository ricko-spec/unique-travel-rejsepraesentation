import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService, describeFetchError } from "@/lib/supabase/server";
import { loadConversionAdminOverview } from "@/lib/conversion/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vision 3.0 Fase 5, Gate B (Issue #80) — read-only admin-API for
// konverteringsmålingen. Samme adgangsmønster som /admin/api/trips:
// uautentificeret => 401 FØR nogen læsning. Svaret indeholder UDELUKKENDE
// aggregater (small-cell + komplementært undertrykt af
// src/lib/conversion/aggregate.ts) — ingen deal-id'er, bookingnumre eller
// andre identifikatorer forlader nogensinde denne route.
//
// FAIL-CLOSED "IKKE STARTET": manglende tabel (migration 013 ikke anvendt
// endnu) behandles som en gyldig, tom "ikke startet"-tilstand — se
// adminServer.ts. Svaret er derfor ALDRIG en falsk fejl blot fordi Gate B2
// ikke er kørt endnu.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  try {
    const result = await loadConversionAdminOverview(getSupabaseService());
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
    return NextResponse.json(result.aggregate);
  } catch (e) {
    console.error("[GET /admin/api/conversion] threw", e);
    return NextResponse.json(
      { error: `Kunne ikke hente: ${describeFetchError(e)}` },
      { status: 500 },
    );
  }
}
