import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { loadConversionAdminOverview } from "@/lib/conversion/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vision 3.0 Fase 5, Gate B (Issue #80) — read-only admin-API for
// konverteringsmålingen. Samme adgangsmønster som /admin/api/trips:
// uautentificeret => 401 FØR nogen læsning. Svaret er den eksplicitte
// wire-DTO (src/lib/conversion/wire.ts): UDELUKKENDE small-cell- og
// komplementært undertrykte aggregater, alle datoer som ISO-strenge — ingen
// deal-id'er, bookingnumre eller andre identifikatorer.
//
// FAIL-CLOSED "IKKE STARTET": manglende tabel (migration 013 ikke anvendt
// endnu) behandles som en gyldig, tom "ikke startet"-tilstand — se
// adminServer.ts. Fejlsvar indeholder aldrig interne detaljer.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  try {
    const result = await loadConversionAdminOverview(getSupabaseService());
    if (!result.ok) {
      return NextResponse.json({ error: "Konverteringsmålingen kunne ikke hentes fuldstændigt" }, { status: 500 });
    }
    return NextResponse.json(result.wire);
  } catch (e) {
    console.error("[GET /admin/api/conversion] threw", e instanceof Error ? e.name : "ukendt");
    return NextResponse.json({ error: "Konverteringsmålingen kunne ikke hentes" }, { status: 500 });
  }
}
