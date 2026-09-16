import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase/server";
import {
  ANALYTICS_BRIDGE_SCHEMA_VERSION,
  decodeCursor,
  encodeCursor,
  isAuthorizedRequest,
  parseLimit,
  toTravelPlanRecord,
  type TripRowForExport,
} from "@/lib/analytics-bridge";

// Analytics Bridge API (Issue #45) — read-only, server-to-server eksport af
// online rejseplaner til Marketing Dashboard. Se docs/ANALYTICS-BRIDGE-API.md
// for den fulde kontrakt (auth, HMAC-normalisering, paginering, felter).
//
// v1: fuld eksport ved hvert kald, ingen `since`/incremental sync — se
// Pagination-kommentaren i src/lib/analytics-bridge.ts for begrundelsen
// (clock-skew-risiko ved kun ca. 250 rejseplaner opvejer ikke den
// kompleksitet en watermark-arkitektur ville kræve).
//
// SEC: ingen CORS-headers tilføjes bevidst — det er det der forhindrer
// almindelig browser-brug på tværs af origins (jf. Issue #45: "ingen
// CORS-bred offentlig browserbrug"). Tilføj ALDRIG
// `Access-Control-Allow-Origin: *` eller lignende her.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function errorResponse(status: number, message: string) {
  // Sanitiserede fejl: aldrig Supabase/Postgres-fejltekst, stack traces eller
  // andre interne detaljer i responsen — kun en fast, generisk besked pr.
  // fejltype. Detaljer logges server-side (se console.error-kaldene
  // nedenfor, som alle logger navngivne, sanitiserede felter — aldrig et
  // rått exception-objekt).
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function GET(req: Request) {
  const apiKey = process.env.ANALYTICS_BRIDGE_API_KEY;
  const matchSecret = process.env.BOOKING_MATCH_SECRET;

  // Fail closed: manglende/forkert Authorization-header ELLER manglende
  // server-nøgle giver begge 401 — aldrig et "auth er slået fra"-fallback.
  if (!isAuthorizedRequest(req.headers.get("authorization"), apiKey)) {
    return errorResponse(401, "Unauthorized");
  }
  if (!matchSecret) {
    // Adskilt fra API-nøglen med vilje (Issue #45). Uden den kan vi ikke
    // beregne booking_match_key sikkert — stop frem for at gætte/udelade den.
    console.error("[analytics-bridge] BOOKING_MATCH_SECRET er ikke konfigureret");
    return errorResponse(500, "Server misconfiguration");
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");

  // afterId: null = første side (start forfra, fuld eksport). Se
  // Cursor-kommentaren i src/lib/analytics-bridge.ts.
  let afterId: string | null = null;
  if (cursorParam) {
    const decoded = decodeCursor(cursorParam);
    if (!decoded) {
      return errorResponse(400, "Invalid cursor parameter");
    }
    afterId = decoded.id;
  }

  try {
    const supabase = getSupabaseService();

    // Kun de kolonner der reelt bruges — se toTravelPlanRecord for hvorfor
    // det ALENE ikke er nok til at garantere sanitisering (den bygger et
    // helt nyt objekt, spreder aldrig `...row`), men hold selve SELECT'et
    // minimalt som første forsvarslinje.
    let query = supabase
      .from("trips")
      .select("id, booking_no, destination, active, created_at")
      .order("id", { ascending: true })
      // Hent én ekstra række for at kunne afgøre has_more uden en separat
      // count-forespørgsel. Grænsen (MAX_PAGE_SIZE=500) holdes bevidst under
      // PostgREST' standard max-rows (1000, verificeret for dette projekt i
      // Issue #38-arbejdet) — se docs/ANALYTICS-BRIDGE-API.md for den fulde
      // begrundelse og hvad der skal tjekkes hvis grænsen nogensinde ændres.
      .limit(limit + 1);

    if (afterId) {
      query = query.gt("id", afterId);
    }

    const { data, error } = await query;

    if (error) {
      // Sanitiseret: kun Postgres/PostgREST-metadata, aldrig rådata fra
      // trips-rækker (som kan indeholde kundedata i data/raw_pdf_text).
      console.error("[analytics-bridge] query fejlede", {
        code: error.code,
        message: error.message,
      });
      return errorResponse(500, "Internal error");
    }

    const rows = (data ?? []) as TripRowForExport[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const records = page.map((row) => toTravelPlanRecord(row, matchSecret));

    const nextCursor =
      hasMore && page.length > 0 ? encodeCursor({ id: page[page.length - 1].id }) : null;

    return NextResponse.json(
      {
        schema_version: ANALYTICS_BRIDGE_SCHEMA_VERSION,
        data: records,
        pagination: {
          next_cursor: nextCursor,
          has_more: hasMore,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    // Log ALDRIG selve exception-objektet: kan i teorien bære en stack
    // trace, forbindelsesstrenge eller andre interne detaljer afhængigt af
    // hvad der fejlede. Kun en fast, sikker besked + fejlens konstruktør-
    // navn (fx "TypeError") — aldrig e.message, e.stack, request-data,
    // env-værdier, secrets, bookingnummer eller trip-data.
    const errorType = e instanceof Error ? e.name : "unknown";
    console.error("[analytics-bridge] uventet fejl", { type: errorType });
    return errorResponse(500, "Internal error");
  }
}
