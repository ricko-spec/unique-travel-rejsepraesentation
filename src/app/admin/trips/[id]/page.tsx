import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import type { Trip } from "@/lib/types";
import { classifyTripEngagement, type RawTripVisitRow } from "@/lib/trip-engagement";
import {
  buildSectionEngagementDisplay,
  type RawSectionEngagementRow,
} from "@/lib/section-engagement";
import { resolveEligibleSections } from "@/lib/trip-eligibility";
import { buildContactIntentDisplay, type RawContactIntentRow } from "@/lib/contact-intent";
import { resolveContactChannels } from "@/lib/contact-intent-trip";
import { pickDestinationMatch, type DestinationRecord } from "@/lib/destination-match";
import { TripDetail } from "./TripDetail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rejse-detaljer · Unique Travel",
  robots: { index: false, follow: false },
};

type TripRow = {
  id: string;
  booking_no: string;
  slug: string;
  destination: string;
  customer_name: string | null;
  active: boolean;
  data: Trip;
  created_at: string;
};

export default async function TripDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!(await getSessionUser())) redirect("/admin");

  const supabase = getSupabaseService();

  // ISSUE-69/#71/#73: trip_visits', trip_section_engagement's og
  // trip_contact_intent's trip_id ER params.id (FK til trips.id), og
  // destinations er en uafhængig, lille opslagstabel — alle fem opslag kan
  // derfor køre PARALLELT med trip-hentningen i stedet for at vente på den.
  // Findes trippen ikke, kasseres de øvrige resultater blot ubrugt nedenfor.
  // "Ingen række" og "opslaget fejlede" er bevidst forskellige tilstande alle
  // steder — se src/lib/trip-engagement.ts, src/lib/section-engagement.ts og
  // src/lib/contact-intent.ts. En analytics-fejl må ALDRIG blokere sælgerens
  // adgang til resten af siden.
  const [tripResult, visitResult, sectionResult, contactResult, destinationsResult] = await Promise.all([
    supabase
      .from("trips")
      .select("id, booking_no, slug, destination, customer_name, active, data, created_at")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("trip_visits")
      .select("first_opened_at, last_opened_at, visit_count, open_count")
      .eq("trip_id", params.id)
      .maybeSingle(),
    supabase
      .from("trip_section_engagement")
      .select("section, last_seen_at")
      .eq("trip_id", params.id),
    // Fase 3 (#73): kun kanal + seneste klik — max 2 rækker pr. trip.
    supabase
      .from("trip_contact_intent")
      .select("channel, last_clicked_at")
      .eq("trip_id", params.id),
    // Samme destinations-opslag som kundesiden selv bruger (getDestination i
    // src/app/[bookingId]/page.tsx) — nødvendigt for at kunne afgøre om
    // GALLERI faktisk er eligible for denne trip (billeder hører til
    // destinationen, ikke til trippens egen data).
    supabase.from("destinations").select("name, hero_url, gallery"),
  ]);

  if (!tripResult.data) notFound();
  const row = tripResult.data as TripRow;

  if (visitResult.error) {
    console.error(
      "[admin/trips/[id]] trip_visits-opslag (Kundeaktivitet) fejlede",
      visitResult.error,
    );
  }

  const engagement = classifyTripEngagement({
    visitRow: (visitResult.data as RawTripVisitRow | null) ?? null,
    readFailed: !!visitResult.error,
    tripCreatedAt: row.created_at,
  });

  if (sectionResult.error) {
    console.error(
      "[admin/trips/[id]] trip_section_engagement-opslag fejlede",
      sectionResult.error,
    );
  }
  if (destinationsResult.error) {
    console.error(
      "[admin/trips/[id]] destinations-opslag (galleri-eligibility) fejlede",
      destinationsResult.error,
    );
  }

  const destinationMatch = pickDestinationMatch(
    (destinationsResult.data as DestinationRecord[]) ?? [],
    row.destination,
  );
  // Fase 4 (Issue #76): SAMME runtime-validerede eligibility som kundesiden,
  // Fase 2-endpointet og salgsoversigten (resolveEligibleSections:
  // tripSchema → normalizeTrip). Tidligere læstes row.data rå her; en malformed
  // trip kunne så få et falsk "ikke set". null ⇒ "kunne ikke vurderes".
  const eligibleSections = resolveEligibleSections(row.data, destinationMatch?.gallery ?? []);
  // En fejlet destinations-opslag gør galleri-eligibility ubestemmelig, og
  // dermed hele sektionsvisningen — ikke kun galleri-linjen — usikker at
  // vise korrekt. Samme fail-open-kontrakt som trip_visits ovenfor: hellere
  // "kunne ikke hentes" end et forkert eligibility-baseret minus.
  const sectionEngagement = buildSectionEngagementDisplay({
    eligibleSections,
    rows: (sectionResult.data as RawSectionEngagementRow[] | null) ?? null,
    readFailed: !!sectionResult.error || !!destinationsResult.error,
  });

  // Fase 3 (#73): kontakt-intent. Fase 2's "Kontakt set" (sectionEngagement
  // ovenfor) er en helt anden datakilde og blandes ALDRIG ind her.
  //
  // Eligibility afledes af SAMME runtime-sandhed som kundesiden og
  // engagement-endpointet: tripSchema.safeParse → normalizeTrip
  // (resolveContactChannels, src/lib/contact-intent-trip.ts). `row.data` er
  // JSONB og IKKE runtime-valideret her — læst rå ville en malformed/legacy
  // trip (som kundesiden viser fejlside for, uden kontaktlinks) stadig få
  // "Telefon klikket —": et falsk negativt signal. Kan trip-data ikke
  // valideres, er eligibility ukendt (null) ⇒ "kunne ikke vurderes", aldrig
  // "ikke klikket". Email er kun eligible med advisorEmail; phone altid.
  //
  // Fejler selve opslaget (fx hvis migration 012 endnu ikke er kørt), vises
  // "Kontaktaktivitet kunne ikke hentes" — ALDRIG falske "ikke klikket".
  if (contactResult.error) {
    console.error(
      "[admin/trips/[id]] trip_contact_intent-opslag (Kontakt-intent) fejlede",
      contactResult.error,
    );
  }
  const contactChannels = resolveContactChannels(row.data);
  if (contactChannels === null) {
    // Ingen trip-data i loggen — kun at valideringen fejlede.
    console.warn(
      "[admin/trips/[id]] trip-data kunne ikke valideres (tripSchema) — kontakt-intent kan ikke vurderes",
    );
  }
  const contactIntent = buildContactIntentDisplay({
    eligibleChannels: contactChannels,
    rows: (contactResult.data as RawContactIntentRow[] | null) ?? null,
    readFailed: !!contactResult.error,
  });

  return (
    <TripDetail
      id={row.id}
      slug={row.slug}
      bookingNo={row.booking_no}
      destination={row.destination}
      customerName={row.customer_name}
      data={row.data}
      engagement={engagement}
      sectionEngagement={sectionEngagement}
      contactIntent={contactIntent}
    />
  );
}
