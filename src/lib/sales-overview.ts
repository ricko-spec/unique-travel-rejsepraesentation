// Vision 3.0 Fase 4 (Issue #76) — SERVER-side read model for salgsoversigten:
// flet de seks set-læste kilder til ét kompakt DTO. Ren funktion (ingen Supabase/
// Next) — alt I/O er allerede sket (se sales-overview-server.ts), så hele
// semantikken kan unit-testes.
//
// SEMANTIK (docs/VISION-3.0-PHASE-4-PLAN.md §3-§4, §7):
//   * KUN observerede fakta. Ingen fortolkning, score eller vægtning.
//   * Adskilte tilstande pr. signal: positiv · ingen registreret · (før måling, kun
//     Åbnet) · kunne ikke vurderes · kunne ikke hentes. En fejlet kilde eller ukendt
//     eligibility bliver ALDRIG til "ingen registreret".
//   * Fejl pr. kilde er uafhængige: en fejlet kilde giver "kunne ikke hentes" i sin
//     kolonne og udelades fra "Seneste aktivitet" — resten af listen vises.
//   * Trip-data valideres runtime ÉN gang pr. rejseplan (parseNormalizedTrip) — samme
//     sandhed som kundesiden, Fase 2-endpointet og Fase 3.

import {
  classifyTripEngagement,
  toTripEngagementListState,
  type RawTripVisitRow,
} from "./trip-engagement";
import { computeEligibleSectionsForTrip, isSectionId } from "./section-engagement";
import { computeEligibleChannels, isContactChannel } from "./contact-intent";
import { parseNormalizedTrip } from "./trip-eligibility";
import { pickDestinationMatch, type DestinationRecord } from "./destination-match";
import { resolveCreatedByName, type CreatorProfile } from "./trip-creator";
import type {
  ContactCell,
  SalesOverview,
  SalesOverviewRow,
  SalesSource,
  SectionsCell,
} from "./sales-overview-types";

/** Resultatet af én kilde-læsning (readAllRows): hele sættet, eller en fejl — aldrig "delvist". */
export type SourceRows<T> = { ok: true; rows: T[] } | { ok: false };

export type SalesTripRow = {
  id: string;
  booking_no: string;
  slug: string;
  destination: string;
  customer_name: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
  /** Rå JSONB — bruges KUN server-side til eligibility/rådgiver og forlader aldrig serveren. */
  data: unknown;
};

export type SalesVisitRow = RawTripVisitRow & { trip_id?: string | null };
export type SalesSectionRow = {
  trip_id?: string | null;
  section?: string | null;
  last_seen_at?: string | null;
};
export type SalesContactRow = {
  trip_id?: string | null;
  channel?: string | null;
  last_clicked_at?: string | null;
};
export type SalesProfileRow = CreatorProfile & { advisor_match_name?: string | null };

function groupByTrip<T extends { trip_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.trip_id) continue;
    const list = map.get(row.trip_id);
    if (list) list.push(row);
    else map.set(row.trip_id, [row]);
  }
  return map;
}

function toMs(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Nyeste gyldige tidsstempel som ISO-streng, eller null. Ugyldige værdier ignoreres. */
export function latestTimestamp(values: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  for (const v of values) {
    const ms = toMs(v);
    if (ms !== null && (best === null || ms > best)) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}

function nameKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function buildSalesOverview(input: {
  trips: SalesTripRow[];
  visits: SourceRows<SalesVisitRow>;
  sections: SourceRows<SalesSectionRow>;
  contact: SourceRows<SalesContactRow>;
  destinations: SourceRows<DestinationRecord>;
  profiles: SourceRows<SalesProfileRow>;
  /** Den indloggede sælgers auth-id (profiles.id), eller null. */
  viewerId: string | null;
  /** Injectable for deterministiske tests (12-måneders-reglen i klassifikationen). */
  now?: Date;
}): SalesOverview {
  const degraded: SalesSource[] = [];
  if (!input.visits.ok) degraded.push("visits");
  if (!input.sections.ok) degraded.push("sections");
  if (!input.contact.ok) degraded.push("contact");
  if (!input.destinations.ok) degraded.push("destinations");
  if (!input.profiles.ok) degraded.push("profiles");

  const visitByTrip = new Map<string, SalesVisitRow>();
  if (input.visits.ok) {
    for (const v of input.visits.rows) if (v.trip_id) visitByTrip.set(v.trip_id, v);
  }
  const sectionsByTrip = input.sections.ok
    ? groupByTrip(input.sections.rows)
    : new Map<string, SalesSectionRow[]>();
  const contactByTrip = input.contact.ok
    ? groupByTrip(input.contact.rows)
    : new Map<string, SalesContactRow[]>();
  const destinations = input.destinations.ok ? input.destinations.rows : [];
  const profiles: SalesProfileRow[] = input.profiles.ok ? input.profiles.rows : [];

  const viewerProfile = input.viewerId ? profiles.find((p) => p.id === input.viewerId) : undefined;
  const viewerAdvisorKey = nameKey(viewerProfile?.advisor_match_name);
  const mineAvailable = input.profiles.ok && viewerAdvisorKey !== "";

  const trips: SalesOverviewRow[] = input.trips.map((t) => {
    // Åbnet (Fase 1B/1C + Fase 4's not-measured). En fejlet kilde => unavailable.
    const opened = toTripEngagementListState(
      classifyTripEngagement({
        visitRow: visitByTrip.get(t.id) ?? null,
        readFailed: !input.visits.ok,
        tripCreatedAt: t.created_at,
        now: input.now,
      }),
    );

    // Runtime-validering ÉN gang pr. rejseplan (samme parse som kundesiden).
    const trip = parseNormalizedTrip(t.data);

    const sectionRows = sectionsByTrip.get(t.id) ?? [];
    const contactRows = contactByTrip.get(t.id) ?? [];

    // Set
    let sections: SectionsCell;
    if (!input.sections.ok || !input.destinations.ok) {
      sections = { kind: "unavailable" };
    } else if (!trip) {
      sections = { kind: "unassessable" };
    } else {
      const gallery = pickDestinationMatch(destinations, t.destination)?.gallery ?? [];
      const eligible = computeEligibleSectionsForTrip(trip, gallery);
      const reached = new Set(
        sectionRows.filter((r) => isSectionId(r.section)).map((r) => r.section as string),
      );
      const reachedEligible = eligible.filter((s) => reached.has(s));
      sections =
        reachedEligible.length === 0
          ? { kind: "none-registered" }
          : {
              kind: "reached",
              reached: reachedEligible.length,
              total: eligible.length,
              price: reachedEligible.includes("price"),
            };
    }

    // Kontakt (klikket — aldrig "kontaktet")
    let contact: ContactCell;
    if (!input.contact.ok) {
      contact = { kind: "unavailable" };
    } else if (!trip) {
      contact = { kind: "unassessable" };
    } else {
      const eligible = computeEligibleChannels(trip);
      const clicked = new Set(
        contactRows.filter((r) => isContactChannel(r.channel)).map((r) => r.channel as string),
      );
      const phone = eligible.includes("phone") && clicked.has("phone");
      const email = eligible.includes("email") && clicked.has("email");
      contact = phone || email ? { kind: "clicked", phone, email } : { kind: "none-registered" };
    }

    // Seneste aktivitet: kun observerede tidsstempler fra kilder der KUNNE læses
    // (fejlede kilder er tomme maps ovenfor, og en fejlet visits-kilde giver
    // opened.kind === "unavailable").
    const lastActivityAt = latestTimestamp([
      opened.kind === "opened" ? opened.lastOpenedAt : null,
      ...sectionRows.filter((r) => isSectionId(r.section)).map((r) => r.last_seen_at),
      ...contactRows.filter((r) => isContactChannel(r.channel)).map((r) => r.last_clicked_at),
    ]);

    const advisor = trip?.advisor ?? (t.data as { advisor?: unknown } | null)?.advisor;
    const mine = mineAvailable && nameKey(advisor) === viewerAdvisorKey;

    return {
      id: t.id,
      booking_no: t.booking_no,
      slug: t.slug,
      destination: t.destination,
      customer_name: t.customer_name,
      active: t.active,
      created_at: t.created_at,
      created_by_name: resolveCreatedByName(t.created_by, profiles),
      mine,
      opened,
      sections,
      contact,
      lastActivityAt,
    };
  });

  return { trips, viewer: { mineAvailable }, degraded };
}
