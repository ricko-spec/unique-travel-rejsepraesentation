// Vision 3.0 Fase 5, Gate C1 (Issue #84) — den RIGTIGE, snævre, read-only
// HubSpot-adapter. Implementerer HubSpotReadAdapter (hubspotAdapter.ts) mod
// api.hubapi.com med fastlåste grænser:
//
//   · host nøjagtigt https://api.hubapi.com — ingen konfigurerbar base-URL
//   · præcis to endpoints, begge konstanter (ingen generisk path-parameter):
//       GET  /crm/v3/pipelines/deals/754595640      (pipeline + stage-metadata)
//       POST /crm/objects/2026-09/deals/search       (read-only søgning)
//   · pipelinefilter nøjagtigt HUBSPOT_PIPELINE_ID; sortering på hs_object_id
//     (stabil, unik) og heltals-cursor; `total` skal være konstant og nås præcist
//   · kun de seks properties i DEAL_PROPERTIES — ingen associations, historik,
//     kontakter, virksomheder eller propertiesWithHistory
//   · fejl er kategoriske (AdapterFailureReason) — aldrig rå payloads, deal-id'er
//     eller tokens i fejl/log; ingen retry (429 ⇒ fail-closed)
//
// Endpoint-valg (dokumenteret 2026-09-24 mod HubSpots officielle docs): search
// er dokumenteret som den datoversionerede `/crm/objects/2026-09/deals/search`
// (limit ≤ 200, maks. 10.000 resultater pr. query, heltals-`after`); pipelines
// er dokumenteret som `/crm/v3/pipelines/{objectType}/{pipelineId}`. POST til
// search er en læseoperation; adapteren kan ikke nå create/update/archive.

import { HUBSPOT_PIPELINE_ID } from "./contract";
import type { AdapterFailureReason, DealPageResult, HubSpotReadAdapter, StageContractConfirmation } from "./hubspotAdapter";
import type { HubSpotDealObservation } from "./types";

export const HUBSPOT_API_BASE = "https://api.hubapi.com";
export const PIPELINE_PATH = `/crm/v3/pipelines/deals/${HUBSPOT_PIPELINE_ID}`;
export const SEARCH_PATH = "/crm/objects/2026-09/deals/search";

/** De ENESTE deal-properties adapteren nogensinde beder om. */
export const DEAL_PROPERTIES = [
  "pipeline",
  "dealstage",
  "unique_travel_bookingno",
  "unique_travel_dealstatus",
  "hs_is_closed",
  "hs_is_closed_won",
] as const;

/** HubSpots dokumenterede grænse: search kan højst returnere 10.000 resultater pr. query. */
export const SEARCH_RESULT_LIMIT = 10_000;
export const MAX_PAGE_SIZE = 200;
/** HubSpot: 5 search-requests/sekund pr. konto — vi holder god afstand. */
export const MIN_REQUEST_INTERVAL_MS = 250;
export const REQUEST_TIMEOUT_MS = 20_000;

type FetchLike = (url: string, init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

const ALLOWED: ReadonlyArray<{ method: "GET" | "POST"; url: string }> = [
  { method: "GET", url: HUBSPOT_API_BASE + PIPELINE_PATH },
  { method: "POST", url: HUBSPOT_API_BASE + SEARCH_PATH },
];

function statusReason(status: number): AdapterFailureReason {
  if (status === 401) return "http-401";
  if (status === 403) return "http-403";
  if (status === 429) return "http-429";
  if (status >= 500 && status <= 599) return "http-5xx";
  // Andre 4xx (fx 400 ved >10.000 resultater) ⇒ kilden kan ikke bruges som den er.
  return "page-inconsistent";
}

export function createHubSpotLiveAdapter(options: {
  token: string;
  fetchImpl?: FetchLike;
  pageSize?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): HubSpotReadAdapter {
  const token = typeof options.token === "string" ? options.token.trim() : "";
  if (token.length < 20) throw new Error("HUBSPOT_TOKEN_INVALID");
  const pageSize = options.pageSize ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new Error("HUBSPOT_PAGE_SIZE_INVALID");
  const fetchImpl: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  let lastRequestAt = -Infinity;

  async function call(method: "GET" | "POST", url: string, body?: unknown): Promise<{ ok: true; json: unknown } | { ok: false; reason: AdapterFailureReason }> {
    // Hård allowlist: selv en fremtidig kodefejl kan ikke sende noget andet sted hen.
    if (!ALLOWED.some((a) => a.method === method && a.url === url)) throw new Error("HUBSPOT_ENDPOINT_NOT_ALLOWED");
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
      });
    } catch {
      return { ok: false, reason: "network-error" };
    }
    if (res.status < 200 || res.status > 299) return { ok: false, reason: statusReason(res.status) };
    try {
      return { ok: true, json: await res.json() };
    } catch {
      return { ok: false, reason: "page-inconsistent" };
    }
  }

  return {
    async confirmStageContract(): Promise<StageContractConfirmation> {
      const r = await call("GET", HUBSPOT_API_BASE + PIPELINE_PATH);
      if (!r.ok) return { ok: false, reason: r.reason };
      const p = r.json as { id?: unknown; stages?: unknown };
      if (!p || typeof p !== "object" || typeof p.id !== "string" || !Array.isArray(p.stages)) {
        return { ok: false, reason: "page-inconsistent" };
      }
      const stageIds: string[] = [];
      for (const s of p.stages as { id?: unknown }[]) {
        if (!s || typeof s.id !== "string" || s.id.trim() === "") return { ok: false, reason: "page-inconsistent" };
        stageIds.push(s.id);
      }
      return { ok: true, pipelineId: p.id, stageIds };
    },

    async readDealsPage(cursor: string | null): Promise<DealPageResult> {
      if (cursor !== null && !/^\d+$/.test(cursor)) return { ok: false, reason: "page-inconsistent" };
      const body = {
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: HUBSPOT_PIPELINE_ID }] }],
        properties: [...DEAL_PROPERTIES],
        sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
        limit: pageSize,
        ...(cursor !== null ? { after: cursor } : {}),
      };
      const r = await call("POST", HUBSPOT_API_BASE + SEARCH_PATH, body);
      if (!r.ok) return { ok: false, reason: r.reason };
      const page = r.json as { total?: unknown; results?: unknown; paging?: { next?: { after?: unknown } } };
      if (!page || typeof page !== "object" || !Number.isInteger(page.total) || !Array.isArray(page.results)) {
        return { ok: false, reason: "total-mismatch" };
      }
      const total = page.total as number;
      if (total < 0 || total > SEARCH_RESULT_LIMIT) return { ok: false, reason: "total-mismatch" };

      const observations: HubSpotDealObservation[] = [];
      for (const item of page.results as { id?: unknown; properties?: Record<string, unknown> }[]) {
        const obs = toObservation(item);
        if (!obs) return { ok: false, reason: "page-inconsistent" };
        observations.push(obs);
      }
      const rawAfter = page.paging?.next?.after;
      const nextCursor = rawAfter === undefined || rawAfter === null ? null : String(rawAfter);
      if (nextCursor !== null && !/^\d+$/.test(nextCursor)) return { ok: false, reason: "page-inconsistent" };
      return { ok: true, observations, hasMore: nextCursor !== null, nextCursor, total };
    },
  };
}

function parseBool(v: unknown): boolean | null {
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return null;
}

function optionalString(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : undefined;
}

/** Streng mapping; alt uventet ⇒ null (siden afvises fail-closed). Returnerer aldrig andre felter. */
function toObservation(item: { id?: unknown; properties?: Record<string, unknown> }): HubSpotDealObservation | null {
  if (!item || typeof item.id !== "string" || !/^\d+$/.test(item.id) || !item.properties) return null;
  const p = item.properties;
  const pipelineId = optionalString(p.pipeline);
  const dealStageId = optionalString(p.dealstage);
  const booking = optionalString(p.unique_travel_bookingno);
  const status = optionalString(p.unique_travel_dealstatus);
  const closed = parseBool(p.hs_is_closed);
  const won = parseBool(p.hs_is_closed_won);
  if (!pipelineId || !dealStageId || booking === undefined || status === undefined || closed === null || won === null) return null;
  return {
    rawDealId: item.id,
    pipelineId,
    dealStageId,
    bookingNumberRaw: booking,
    dealStatusRaw: status,
    hubspotClosed: closed,
    hubspotClosedWon: won,
  };
}
