// Vision 3.0 Fase 5, Gate C1 (Issue #84) — Fase C3: lokalt, operatørstyret,
// write-free dry-run. IKKE en route; kan kun køres lokalt via
// scripts/operator/Invoke-ConversionDryRun.ps1:
//   node --import ./scripts/operator/ts-hooks.mjs scripts/operator/conversion-dry-run.ts
//
// Læser secrets KUN fra procesmiljøet (sat af wrapperen fra SecureString):
//   HUBSPOT_PRIVATE_APP_TOKEN · BOOKING_MATCH_SECRET · SUPABASE_SERVICE_ROLE_KEY
// HUBSPOT_DEAL_KEY_SECRET genereres her i processen (32 tilfældige bytes) og
// vises/gemmes aldrig — den bruges kun til at pseudonymisere i hukommelsen.
// Supabase-projektet er låst til production-projektet i ACCESS_MATRIX.
// Output: kun formatOperatorReport (aggregater, small-cell-undertrykt).

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createHubSpotLiveAdapter } from "../../src/lib/conversion/hubspotLiveAdapter";
import {
  countConversionTables,
  formatOperatorReport,
  runOperatorDryRun,
  supabaseTableCounter,
} from "../../src/lib/conversion/operatorDryRun";
import { supabaseConversionPersistence } from "../../src/lib/conversion/persistence";

const SUPABASE_URL = "https://iunixfpthdftmkgpugex.supabase.co";

async function main(): Promise<number> {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? "";
  const bookingSecret = process.env.BOOKING_MATCH_SECRET ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const missing = [
    token.trim() ? null : "HUBSPOT_PRIVATE_APP_TOKEN",
    bookingSecret.trim() ? null : "BOOKING_MATCH_SECRET",
    serviceKey.trim() ? null : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    console.log(`VERDICT: FAIL (CONFIG_MISSING: ${missing.join(", ")})`);
    return 1;
  }
  const dealKeySecret = randomBytes(32).toString("hex");

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Kategorisk før/efter-tælling: ved fejl kun tabel + AUTH/PERMISSION/
  // TABLE_NOT_FOUND/NETWORK/INVALID_RESPONSE — aldrig rå fejltekst.
  const countRows = () => countConversionTables(supabaseTableCounter(supabase));

  let adapter;
  try {
    adapter = createHubSpotLiveAdapter({ token });
  } catch {
    console.log("VERDICT: FAIL (CONFIG_INVALID: HubSpot-token)");
    return 1;
  }

  const report = await runOperatorDryRun({
    adapter,
    persistence: supabaseConversionPersistence(supabase),
    countRows,
    dealKeySecret,
    bookingMatchSecret: bookingSecret,
  });
  console.log("=== GATE_C1_DRY_RUN (kun aggregater, small-cell-undertrykt) ===");
  for (const line of formatOperatorReport(report)) console.log(line);
  console.log("=== SLUT ===");
  return report.verdict === "PASS" ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    // Aldrig stack traces (kan indeholde request-detaljer) — kun kategorisk.
    console.log("VERDICT: FAIL (UNEXPECTED_ERROR)");
    process.exitCode = 1;
  });
