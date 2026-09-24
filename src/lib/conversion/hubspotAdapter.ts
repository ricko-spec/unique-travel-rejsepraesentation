// Vision 3.0 Fase 5, Gate B (Issue #80) — read-only HubSpot-adapter-
// KONTRAKT (grænseflade) + en fixture-baseret fake til tests. INGEN live
// HubSpot-kald sker nogen steder i Gate B1 — en rigtig fetch-baseret
// implementering (mod api.hubapi.com) hører til Gate C's aktivering, ikke
// denne PR. Se docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md.
//
// Kontrakten er bevidst SNÆVER: kun det sync-motoren faktisk har brug for,
// aldrig en generel HubSpot-klient, og ALDRIG historik (ingen
// dealstage-history, ingen closedate) — kun dealens aktuelle snapshot.

import type { HubSpotDealObservation } from "./types";

export type AdapterFailureReason =
  | "http-401"
  | "http-403"
  | "http-429"
  | "http-5xx"
  | "network-error"
  | "page-inconsistent"
  | "total-mismatch";

/**
 * Live pipeline-metadata: pipelinens id og den KOMPLETTE liste af stage-id'er.
 * Sync-motoren sammenholder den med PIPELINE_STAGE_CONTRACT (classify.ts
 * verifyStageContract) — en ukendt eller manglende stage er kontraktdrift.
 */
export type StageContractConfirmation =
  | { ok: true; pipelineId: string; stageIds: string[] }
  | { ok: false; reason: AdapterFailureReason };

export type DealPageResult =
  | {
      ok: true;
      observations: HubSpotDealObservation[];
      hasMore: boolean;
      nextCursor: string | null;
      /** HubSpot-søgningens totale antal deals for filteret. Skal være ens på alle sider. */
      total: number;
    }
  | { ok: false; reason: AdapterFailureReason };

/**
 * Read-only HubSpot-læsevej. `readDealsPage(cursor)`: `cursor === null` er
 * første side. Kun deals i HUBSPOT_PIPELINE_ID, med præcis felterne i
 * HubSpotDealObservation. En tom side før `total` er nået, et ændret total,
 * en HTTP-fejl eller en dublet er ALTID en fejl, aldrig et tavst "færdig".
 * Fejlårsager er kategoriske — aldrig rå payloads, id'er eller tokens.
 */
export type HubSpotReadAdapter = {
  confirmStageContract: () => Promise<StageContractConfirmation>;
  readDealsPage: (cursor: string | null) => Promise<DealPageResult>;
};

// ============================================================================
// Fixture-adapter — udelukkende til tests og lokal udvikling. Aldrig brugt
// af noget der rammer et rigtigt netværk.
// ============================================================================

export function fixtureObservation(spec: Partial<HubSpotDealObservation> & { rawDealId: string }): HubSpotDealObservation {
  return {
    pipelineId: "754595640",
    dealStageId: "1098732868",
    bookingNumberRaw: null,
    dealStatusRaw: null,
    hubspotClosed: false,
    hubspotClosedWon: false,
    ...spec,
  };
}

/**
 * Deterministisk fixture-adapter: leverer en fast liste af observationer i
 * sider af `pageSize`. `stages` er den simulerede live stage-liste;
 * `contractFailure` simulerer en HTTP-fejl på metadata-kaldet;
 * `failOnPageIndex`/`failReason` en fejl midt i pagineringen;
 * `reportedTotal` et total der ikke stemmer med de faktiske deals;
 * `totalChangesOnPageIndex` et total der ændrer sig undervejs.
 */
export function createFixtureHubSpotAdapter(options: {
  deals: HubSpotDealObservation[];
  pageSize?: number;
  pipelineId?: string;
  stages?: string[];
  contractFailure?: AdapterFailureReason;
  failOnPageIndex?: number;
  failReason?: AdapterFailureReason;
  reportedTotal?: number;
  totalChangesOnPageIndex?: number;
}): HubSpotReadAdapter & { pageCalls: () => number } {
  const pageSize = options.pageSize ?? 50;
  let calls = 0;

  return {
    pageCalls: () => calls,
    async confirmStageContract() {
      if (options.contractFailure) return { ok: false, reason: options.contractFailure };
      return {
        ok: true,
        pipelineId: options.pipelineId ?? "754595640",
        stageIds: options.stages ?? ["1098732868", "1169407502"],
      };
    },
    async readDealsPage(cursor) {
      calls += 1;
      const pageIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      if (options.failOnPageIndex !== undefined && pageIndex === options.failOnPageIndex) {
        return { ok: false, reason: options.failReason ?? "network-error" };
      }
      const start = pageIndex * pageSize;
      const slice = options.deals.slice(start, start + pageSize);
      const hasMore = start + pageSize < options.deals.length;
      const baseTotal = options.reportedTotal ?? options.deals.length;
      const total =
        options.totalChangesOnPageIndex !== undefined && pageIndex >= options.totalChangesOnPageIndex
          ? baseTotal + 1
          : baseTotal;
      return { ok: true, observations: slice, hasMore, nextCursor: hasMore ? String(pageIndex + 1) : null, total };
    },
  };
}
