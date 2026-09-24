// Vision 3.0 Fase 5, Gate B (Issue #80) — read-only HubSpot-adapter-
// KONTRAKT (grænseflade) + en fixture-baseret fake til tests. INGEN live
// HubSpot-kald sker nogen steder i Gate B1 — en rigtig fetch-baseret
// implementering (mod api.hubapi.com) hører til Gate C's aktivering, ikke
// denne PR. Se docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md.
//
// Kontrakten er bevidst SNÆVER: kun det sync-motoren faktisk har brug for,
// aldrig en generel HubSpot-klient. Al pipeline-/stage-kontraktbekræftelse
// sker FØR nogen deal-læsning (samme mønster som Marketing Dashboard-
// projektets confirmQuoteStageContract, genbrugt som idé, ikke som kode).

import type { HubSpotDealObservation } from "./types";

export type StageContractConfirmation =
  | { ok: true }
  | { ok: false; reason: string };

export type DealPageFailureReason =
  | "http-401"
  | "http-403"
  | "http-429"
  | "http-5xx"
  | "network-error"
  | "page-inconsistent"
  | "total-mismatch";

export type DealPageResult =
  | { ok: true; observations: HubSpotDealObservation[]; hasMore: boolean; nextCursor: string | null }
  | { ok: false; reason: DealPageFailureReason; message: string };

/**
 * Read-only HubSpot-læsevej. `confirmStageContract` SKAL kaldes og returnere
 * `ok: true` før `readDealsPage` bruges — sync-motoren håndhæver
 * rækkefølgen (se syncEngine.ts), men adapteren selv garanterer heller
 * ikke andet end at levere de rå observationer for én side ad gangen.
 *
 * `readDealsPage(cursor)`: `cursor === null` er første side. Implementeres
 * som keyset-paginering (aldrig OFFSET), samme princip som
 * Analytics Bridge/paged-read.ts — en tom side FØR det forventede antal, et
 * uventet fald i deal-antal eller en HTTP-fejl er ALTID `ok: false`, aldrig
 * et tavst "færdig".
 */
export type HubSpotReadAdapter = {
  confirmStageContract: () => Promise<StageContractConfirmation>;
  readDealsPage: (cursor: string | null) => Promise<DealPageResult>;
};

// ============================================================================
// Fixture-adapter — udelukkende til tests og lokal udvikling. Aldrig brugt
// af noget der rammer et rigtigt netværk.
// ============================================================================

export type FixtureDealSpec = {
  rawDealId: string;
  everQualifiedAt: Date | null;
  bookingNumberRaw: string | null;
  dealStatusRaw: string | null;
  hubspotClosed: boolean;
  hubspotClosedWon: boolean;
  closedAtRaw: Date | null;
};

export function fixtureObservation(spec: FixtureDealSpec): HubSpotDealObservation {
  return {
    rawDealId: spec.rawDealId,
    everQualifiedAt: spec.everQualifiedAt,
    bookingNumberRaw: spec.bookingNumberRaw,
    dealStatusRaw: spec.dealStatusRaw,
    hubspotClosed: spec.hubspotClosed,
    hubspotClosedWon: spec.hubspotClosedWon,
    closedAtRaw: spec.closedAtRaw,
  };
}

/**
 * Simpel, deterministisk fixture-adapter: leverer en fast liste af
 * observationer i sider af `pageSize`, med samme fail-closed-kontrakt som
 * en rigtig adapter ville. `contractOk: false` simulerer en live
 * stage-/pipelinekontrakt der IKKE matcher (fx et ændret stage-id) —
 * `failOnPage`/`failReason` simulerer en fejl midt i pagineringen.
 */
export function createFixtureHubSpotAdapter(options: {
  deals: HubSpotDealObservation[];
  pageSize?: number;
  contractOk?: boolean;
  failOnPageIndex?: number;
  failReason?: DealPageFailureReason;
}): HubSpotReadAdapter {
  const pageSize = options.pageSize ?? 50;
  const contractOk = options.contractOk ?? true;

  return {
    async confirmStageContract() {
      if (!contractOk) return { ok: false, reason: "fixture: kontraktdrift simuleret" };
      return { ok: true };
    },
    async readDealsPage(cursor) {
      const pageIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      if (options.failOnPageIndex !== undefined && pageIndex === options.failOnPageIndex) {
        return {
          ok: false,
          reason: options.failReason ?? "network-error",
          message: `fixture: simuleret fejl på side ${pageIndex}`,
        };
      }
      const start = pageIndex * pageSize;
      const slice = options.deals.slice(start, start + pageSize);
      const hasMore = start + pageSize < options.deals.length;
      return {
        ok: true,
        observations: slice,
        hasMore,
        nextCursor: hasMore ? String(pageIndex + 1) : null,
      };
    },
  };
}
