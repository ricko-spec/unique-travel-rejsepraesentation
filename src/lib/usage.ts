// Aggregeringslogik for /admin/brug (Issue #38). Udskilt fra API-routen så
// den kan unit-testes uden en levende Supabase-forbindelse — routen henter
// blot alle profiles + upload_events og lader summarizeUsage lave tallene.

import { getSupabaseService } from "./supabase/server";

export type UsagePeriod = "7d" | "30d" | "all";

export type UsageProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

// Minimal projektion af upload_events — matcher UploadEvent i upload-events.ts.
export type UsageEventRow = {
  id: string;
  user_id: string | null;
  actor_name: string;
  received_at: string;
  status: string;
  save_kind: "created" | "updated" | null;
};

export type UserUsageRow = {
  userId: string;
  name: string;
  uploads: number;
  published: number;
  newTrips: number;
  reuploads: number;
  errors: number;
  parsedNotSaved: number;
  lastUploadAt: string | null;
};

export type UsageSummary = {
  period: UsagePeriod;
  periodStart: string | null; // null = "all"
  totalUploads: number;
  activeUsers: number;
  zeroUploadUsers: number;
  trackingSince: string | null; // min(received_at) over ALLE events, uanset periode
  stalledEvents: number; // received/parsed ældre end 24 timer, uanset periode
  historicalActorEvents: number; // events uden user_id (bruger slettet siden)
  users: UserUsageRow[];
};

const ERROR_STATUSES = new Set(["validation_failed", "parse_failed", "save_failed"]);
const STALLED_STATUSES = new Set(["received", "parsed"]);
const DAY_MS = 24 * 60 * 60 * 1000;

// Alle timestamp-sammenligninger i denne fil går via Date/epoch-ms — ALDRIG
// via string-sammenligning (`>=`/`<` på ISO-strenge). Postgres/PostgREST kan
// returnere timestamptz med varierende brøkdel-præcision og enten "Z" eller
// "+00:00" som suffiks; sådanne strenge sorterer ikke pålideligt mod hinanden
// eller mod en JS `Date#toISOString()`-streng, selvom de repræsenterer
// korrekte tidspunkter. Kun numerisk (epoch ms) sammenligning er korrekt.
function toMs(iso: string): number {
  return new Date(iso).getTime();
}

// now som parameter (ikke Date.now() internt) — gør cutoff-beregning og
// "ufærdiggjort > 24t"-beregning deterministisk i tests.
export function periodStart(period: UsagePeriod, now: Date): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function summarizeUsage(
  profiles: UsageProfile[],
  allEvents: UsageEventRow[],
  period: UsagePeriod,
  now: Date,
): UsageSummary {
  const start = periodStart(period, now);
  const startMs = start ? toMs(start) : null;
  const inPeriod = startMs === null ? allEvents : allEvents.filter((e) => toMs(e.received_at) >= startMs);

  const byUser = new Map<string, UserUsageRow>();
  for (const p of profiles) {
    byUser.set(p.id, {
      userId: p.id,
      name: p.full_name?.trim() || p.email,
      uploads: 0,
      published: 0,
      newTrips: 0,
      reuploads: 0,
      errors: 0,
      parsedNotSaved: 0,
      lastUploadAt: null,
    });
  }

  let totalUploads = 0;

  for (const e of inPeriod) {
    // Se kommentaren ved row.uploads nedenfor: hver række er én modtaget
    // upload uanset dens nuværende (senere) status.
    totalUploads += 1;

    if (!e.user_id) {
      // Bruger slettet siden (ON DELETE SET NULL) — tælles stadig med i
      // totalen ovenfor, men kan ikke tilskrives en profil-række.
      continue;
    }

    let row = byUser.get(e.user_id);
    if (!row) {
      // Bruger findes i upload_events men ikke (længere) i profiles —
      // vis alligevel med det snapshottede navn frem for at tabe eventet.
      row = {
        userId: e.user_id,
        name: e.actor_name,
        uploads: 0,
        published: 0,
        newTrips: 0,
        reuploads: 0,
        errors: 0,
        parsedNotSaved: 0,
        lastUploadAt: null,
      };
      byUser.set(e.user_id, row);
    }

    // "Uploads" = antal received_at-events i perioden, UANSET hvor eventet
    // senere endte (parsed/published/failed). status er den CURRENT/final
    // tilstand af rækken (opdateret in-place), ikke en historik — så et event
    // der nu står som 'published' var stadig én upload. Dette er den
    // autoritative adoption-måling (jf. Issue #38: "Primær adoption-måling
    // er altid received_at-eventet").
    row.uploads += 1;
    if (!row.lastUploadAt || toMs(e.received_at) > toMs(row.lastUploadAt)) {
      row.lastUploadAt = e.received_at;
    }
    if (e.status === "published") {
      row.published += 1;
      if (e.save_kind === "created") row.newTrips += 1;
      if (e.save_kind === "updated") row.reuploads += 1;
    }
    if (ERROR_STATUSES.has(e.status)) row.errors += 1;
    if (e.status === "parsed") row.parsedNotSaved += 1;
  }

  const users = [...byUser.values()].sort((a, b) => b.uploads - a.uploads);
  const activeUsers = users.filter((u) => u.uploads > 0).length;
  const zeroUploadUsers = users.filter((u) => u.uploads === 0).length;

  const trackingSince = allEvents.reduce<string | null>((min, e) => {
    if (!min || toMs(e.received_at) < toMs(min)) return e.received_at;
    return min;
  }, null);

  // Tracking-health-sektionen (stalled/historisk-actor) er bevidst global —
  // uafhængig af periodevælgeren, så en "ufærdiggjort" upload fra sidste uge
  // ikke forsvinder bare fordi brugeren kigger på 7-dages-visningen.
  const stalledCutoffMs = now.getTime() - DAY_MS;
  const stalledEvents = allEvents.filter(
    (e) => STALLED_STATUSES.has(e.status) && toMs(e.received_at) < stalledCutoffMs,
  ).length;
  const historicalActorEvents = allEvents.filter((e) => !e.user_id).length;

  return {
    period,
    periodStart: start,
    totalUploads,
    activeUsers,
    zeroUploadUsers,
    trackingSince,
    stalledEvents,
    historicalActorEvents,
    users,
  };
}

// ----------------------------------------------------------------------------
// Keyset-paginering af upload_events (fix for Issue #38-reviewfund: en almindelig
// .select() uden paginering kan blive stille trunkeret af PostgREST/Supabase'
// standard max-rows (typisk 1000) — uploadtal ville dermed kunne blive FALSKT
// lave uden nogen fejl. Løsningen er IKKE offset/range-paginering (som kan give
// dubletter/manglende rækker hvis nye events indsættes mens vi paginerer,
// fordi OFFSET er en position, ikke en værdi) — i stedet bruges keyset-
// paginering på den unikke, uforanderlige `id`-kolonne: "hent alle rækker med
// id > sidste sete id". Det er stabilt uanset samtidige inserts, og
// termineringsbetingelsen er UDELUKKENDE "fik vi en tom side" — aldrig
// "fik vi færre rækker end vi bad om", fordi en skjult server-side
// rækkegrænse kan capse en side under det ønskede limit selvom der er mere
// data tilbage.
// ----------------------------------------------------------------------------

export const USAGE_EVENTS_PAGE_SIZE = 500;

export type FetchEventsPage = (
  cursor: string | null,
  limit: number,
) => Promise<UsageEventRow[]>;

export async function fetchAllUsageEvents(
  fetchPage: FetchEventsPage,
  pageSize: number = USAGE_EVENTS_PAGE_SIZE,
): Promise<UsageEventRow[]> {
  const all: UsageEventRow[] = [];
  let cursor: string | null = null;
  // Rent defensivt loft mod en uendelig løkke, hvis en fetchPage-implementering
  // fejlagtigt aldrig returnerer en tom side — ikke en forventet kodevej.
  const MAX_PAGES = 100_000;

  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(cursor, pageSize);
    if (page.length === 0) break;
    all.push(...page);
    cursor = page[page.length - 1].id;
  }

  return all;
}

// Ordnet på `id` (ikke received_at): id er den primære nøgle og ændres
// aldrig, hvilket gør den til et sikkert keyset-cursor-felt. received_at
// bruges stadig til selve periode-filtreringen i summarizeUsage.
async function fetchUploadEventsPage(
  cursor: string | null,
  limit: number,
): Promise<UsageEventRow[]> {
  const supabase = getSupabaseService();
  let query = supabase
    .from("upload_events")
    .select("id, user_id, actor_name, received_at, status, save_kind")
    .order("id", { ascending: true })
    .limit(limit);
  if (cursor) query = query.gt("id", cursor);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UsageEventRow[];
}

// Henter ALLE upload_events-rækker via keyset-paginering — bruges af
// GET /admin/api/usage i stedet for et enkelt .select() som kunne blive
// trunkeret af en skjult max-rows-grænse.
export function fetchAllUploadEvents(): Promise<UsageEventRow[]> {
  return fetchAllUsageEvents(fetchUploadEventsPage);
}
