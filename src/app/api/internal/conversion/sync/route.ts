import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase/server";
import { createHubSpotLiveAdapter } from "@/lib/conversion/hubspotLiveAdapter";
import { supabaseConversionPersistence } from "@/lib/conversion/persistence";
import { handleConversionSyncRequest } from "@/lib/conversion/syncRoute";

// Vision 3.0 Fase 5, Gate D (Issue #89) — daglig sync af den prospektive
// konverteringsmåling. Kaldes af Vercel Cron (GET med
// `Authorization: Bearer $CRON_SECRET`) og af operatør-wrapperen
// scripts/operator/Invoke-ConversionSync.ps1 til den første, kontrollerede
// baseline. Al logik og alle værn ligger i handleConversionSyncRequest
// (auth → kun production → secrets → runConversionSync).
//
// Uden singleton-række / med status NOT_STARTED eller PAUSED gør routen
// INTET (SKIPPED). Cron-konfigurationen (vercel.json) er et separat,
// godkendt aktiveringstrin — se docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md § Gate D.
//
// SEC: ingen CORS-headers; svaret er kun kategorisk (ingen secrets, id'er
// eller fejltekst), og logs indeholder kun resultat + fejlkode.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const { status, body } = await handleConversionSyncRequest(
    req.headers.get("authorization"),
    {
      CRON_SECRET: process.env.CRON_SECRET,
      VERCEL_ENV: process.env.VERCEL_ENV,
      HUBSPOT_PRIVATE_APP_TOKEN: process.env.HUBSPOT_PRIVATE_APP_TOKEN,
      HUBSPOT_DEAL_KEY_SECRET: process.env.HUBSPOT_DEAL_KEY_SECRET,
      BOOKING_MATCH_SECRET: process.env.BOOKING_MATCH_SECRET,
    },
    {
      createAdapter: (token) => createHubSpotLiveAdapter({ token }),
      createPersistence: () => supabaseConversionPersistence(getSupabaseService()),
    },
  );
  // Kun kategoriske felter i loggen (Vercel-logs er den primære fejlalarm ud over admin).
  const line = `[conversion-sync] result=${body.result} code=${body.errorCode ?? "-"} baseline=${body.baseline ?? "-"} audit=${body.auditRecorded}`;
  if (status >= 400 && status !== 401) console.error(line);
  else console.info(line);
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
