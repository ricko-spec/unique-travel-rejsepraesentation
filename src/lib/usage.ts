// Aggregeringslogik for /admin/brug (Issue #38). Udskilt fra API-routen så
// den kan unit-testes uden en levende Supabase-forbindelse — routen henter
// blot alle profiles + upload_events og lader summarizeUsage lave tallene.

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
  const inPeriod = start ? allEvents.filter((e) => e.received_at >= start) : allEvents;

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
    if (!row.lastUploadAt || e.received_at > row.lastUploadAt) {
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
    if (!min || e.received_at < min) return e.received_at;
    return min;
  }, null);

  // Tracking-health-sektionen (stalled/historisk-actor) er bevidst global —
  // uafhængig af periodevælgeren, så en "ufærdiggjort" upload fra sidste uge
  // ikke forsvinder bare fordi brugeren kigger på 7-dages-visningen.
  const stalledCutoff = new Date(now.getTime() - DAY_MS).toISOString();
  const stalledEvents = allEvents.filter(
    (e) => STALLED_STATUSES.has(e.status) && e.received_at < stalledCutoff,
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
