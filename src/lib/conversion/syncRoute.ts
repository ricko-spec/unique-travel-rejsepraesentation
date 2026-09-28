// Vision 3.0 Fase 5, Gate D (Issue #89) — handler bag den server-side
// sync-route, som Vercel Cron (og operatør-wrapperen til den første,
// kontrollerede baseline) kalder: GET /api/internal/conversion/sync.
//
// Ren, testbar funktion: al I/O (HubSpot-adapter, persistence, ur) injiceres.
// Rækkefølgen er BINDENDE og fail-closed:
//
//   1. Bearer CRON_SECRET (konstant-tids-sammenligning, genbrug af Analytics
//      Bridge-helperen). Mangler serverens CRON_SECRET ⇒ 401 — aldrig "auth
//      slået fra".
//   2. Kun production (VERCEL_ENV === "production"). Preview-deploys deler
//      production-DB'en; en preview med secrets må aldrig kunne skrive.
//   3. HubSpot-token + de to HMAC-secrets valideres, FØR noget læses eller
//      skrives (CONFIG_INVALID). Selve motoren validerer secrets igen.
//   4. runConversionSync — lease, stage-kontrakt, komplet læsning, atomisk
//      commit eller FAILED-run. NOT_STARTED/PAUSED ⇒ SKIPPED uden skrivning.
//
// Svaret er KUN kategorisk: resultat, fejlkode, baseline-flag, om
// revisionsrækken blev skrevet, og det observerede antal deals (en total, som
// small-cell-undertrykkes ved 1–9). Aldrig token, secrets, deal-id'er,
// nøgler, rækker eller rå fejltekst.

import { isAuthorizedRequest } from "../analytics-bridge";
import { SMALL_CELL_THRESHOLD } from "./contract";
import type { HubSpotReadAdapter } from "./hubspotAdapter";
import type { ConversionPersistence } from "./persistence";
import { runConversionSync } from "./syncEngine";
import type { SyncRunErrorCode } from "./types";

export type ConversionSyncEnv = {
  CRON_SECRET?: string;
  VERCEL_ENV?: string;
  HUBSPOT_PRIVATE_APP_TOKEN?: string;
  HUBSPOT_DEAL_KEY_SECRET?: string;
  BOOKING_MATCH_SECRET?: string;
};

export type ConversionSyncDeps = {
  createAdapter: (token: string) => HubSpotReadAdapter;
  createPersistence: () => ConversionPersistence;
  now?: () => Date;
};

export type ConversionSyncResult = "SUCCEEDED" | "SKIPPED" | "FAILED" | "REJECTED";

export type ConversionSyncBody = {
  result: ConversionSyncResult;
  errorCode: SyncRunErrorCode | "UNAUTHORIZED" | "NOT_PRODUCTION" | null;
  baseline: boolean | null;
  /** Antal observerede deals i kørslen; null hvis ikke gennemført eller 1–9 (small-cell). */
  observed: number | null;
  /** false ⇒ FAILED-revisionsrækken kunne ikke skrives (eller kørslen blev afvist før en lease). */
  auditRecorded: boolean;
};

export type ConversionSyncResponse = { status: number; body: ConversionSyncBody };

const reject = (status: number, errorCode: ConversionSyncBody["errorCode"]): ConversionSyncResponse => ({
  status,
  body: { result: "REJECTED", errorCode, baseline: null, observed: null, auditRecorded: false },
});

function safeTotal(n: number): number | null {
  return n > 0 && n < SMALL_CELL_THRESHOLD ? null : n;
}

/** HTTP-status pr. fejlkode. Ikke-2xx gør en fejlet cron-kørsel synlig i Vercels logs. */
function statusFor(code: SyncRunErrorCode): number {
  if (code === "SYNC_ALREADY_RUNNING") return 409;
  if (code === "CONFIG_INVALID") return 500;
  return 502;
}

export async function handleConversionSyncRequest(
  authorizationHeader: string | null,
  env: ConversionSyncEnv,
  deps: ConversionSyncDeps,
): Promise<ConversionSyncResponse> {
  if (!isAuthorizedRequest(authorizationHeader, env.CRON_SECRET?.trim() || undefined)) {
    return reject(401, "UNAUTHORIZED");
  }
  if (env.VERCEL_ENV !== "production") {
    return reject(403, "NOT_PRODUCTION");
  }

  const token = env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? "";
  const dealKeySecret = env.HUBSPOT_DEAL_KEY_SECRET ?? "";
  const bookingMatchSecret = env.BOOKING_MATCH_SECRET ?? "";
  const configInvalid: ConversionSyncResponse = {
    status: 500,
    body: { result: "FAILED", errorCode: "CONFIG_INVALID", baseline: null, observed: null, auditRecorded: false },
  };
  if (token === "") return configInvalid;

  let adapter: HubSpotReadAdapter;
  try {
    adapter = deps.createAdapter(token);
  } catch {
    return configInvalid;
  }

  let outcome;
  try {
    outcome = await runConversionSync(adapter, deps.createPersistence(), {
      dealKeySecret,
      bookingMatchSecret,
      now: deps.now ? deps.now() : new Date(),
    });
  } catch {
    // runConversionSync kaster ikke efter en lease (den fanger selv); en
    // exception her er før lease ⇒ ingen revisionsrække, intet skrevet.
    return {
      status: 502,
      body: { result: "FAILED", errorCode: "UNKNOWN", baseline: null, observed: null, auditRecorded: false },
    };
  }

  if (outcome.ok) {
    return {
      status: 200,
      body: {
        result: "SUCCEEDED",
        errorCode: null,
        baseline: outcome.isBaseline,
        observed: safeTotal(outcome.counts.observed),
        auditRecorded: true,
      },
    };
  }
  if (outcome.errorCode === "NOT_ACTIVE") {
    // NOT_STARTED/PAUSED/ingen singleton: forventet før Gate D og ved pause — ingen skrivning.
    return { status: 200, body: { result: "SKIPPED", errorCode: "NOT_ACTIVE", baseline: null, observed: null, auditRecorded: false } };
  }
  return {
    status: statusFor(outcome.errorCode),
    body: { result: "FAILED", errorCode: outcome.errorCode, baseline: null, observed: null, auditRecorded: outcome.auditRecorded },
  };
}
