import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { AccessGate } from "./AccessGate";
import { DestinationGallery } from "@/components/trip/DestinationGallery";
import type { Metadata } from "next";
import { getSupabaseService } from "@/lib/supabase/server";
import { tripSchema, normalizeTrip, type TripRow } from "@/lib/types";
import { getDestination } from "@/lib/destination-lookup";
import { Hero } from "@/components/trip/Hero";
import { TripDetails } from "@/components/trip/TripDetails";
import { Timeline } from "@/components/trip/Timeline";
import { Hotels } from "@/components/trip/Hotels";
import { PriceAndNote } from "@/components/trip/PriceAndNote";
import { ContactCTA } from "@/components/trip/ContactCTA";
import { Footer } from "@/components/trip/Footer";
import { ActionBar } from "@/components/trip/ActionBar";
import { ProgressNav } from "@/components/trip/ProgressNav";
import { filterGalleryImages, visibleNavSections } from "@/lib/progress-nav";
import { hasValidTripAccess, tripAccessCookieName, TRIP_PAGE_ROBOTS } from "@/lib/trip-access";
import { shouldRecordTripVisit } from "@/lib/trip-visit";
import { scheduleTripVisit } from "@/lib/trip-visit-write";
import { computeEligibleSectionsForTrip } from "@/lib/section-engagement";
import { SectionEngagementTracker } from "@/components/trip/SectionEngagementTracker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadTrip(bookingId: string): Promise<TripRow | null> {
  try {
    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("slug", bookingId)
      .eq("active", true)
      .maybeSingle();
    if (error || !data) return null;
    return data as TripRow;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { bookingId: string };
}): Promise<Metadata> {
  const row = await loadTrip(params.bookingId);
  const dest = row?.destination ?? "rejse";
  return {
    title: `Unique Travel — Jeres rejse til ${dest}`,
    robots: TRIP_PAGE_ROBOTS,
  };
}

export default async function TripPage({ params }: { params: { bookingId: string } }) {
  const row = await loadTrip(params.bookingId);
  if (!row) notFound();

  const accessCookie = cookies().get(tripAccessCookieName(params.bookingId));
  if (!hasValidTripAccess(accessCookie?.value, row.booking_no)) {
    return <AccessGate slug={params.bookingId} destination={row.destination} />;
  }

  // Vision 3.0 Fase 1B (Issue #65): cookie-fri besøgsregistrering. Gaten
  // evalueres EKSPLICIT (aldrig et ubetinget kald) og kun EFTER
  // access-kontrollen ovenfor er bestået — se docs/VISION-3.0-EVENT-MODEL.md
  // §8-9. scheduleTripVisit() planlægger, afventer ALDRIG, og kan selv ikke
  // kaste (src/lib/trip-visit-write.ts) — responsen venter ikke på DB'en,
  // hverken ved succes, fejl, timeout eller en fejlende waitUntil().
  const shouldRecord = shouldRecordTripVisit({
    vercelEnv: process.env.VERCEL_ENV,
    host: headers().get("host"),
    userAgent: headers().get("user-agent"),
    cookieNames: cookies()
      .getAll()
      .map((cookie) => cookie.name),
  });
  if (shouldRecord) {
    scheduleTripVisit(row.id);
  }

  const destination = await getDestination(row.destination);

  const parsed = tripSchema.safeParse(row.data);
  if (!parsed.success) {
    return (
      <div className="error-page">
        <div className="error-card">
          <div className="error-mark">Unique Travel</div>
          <div className="error-title">Vi kunne ikke vise denne rejseplan</div>
          <p className="error-body">
            Vi kunne ikke vise denne rejseplan. Kontakt os på{" "}
            <a className="error-phone" href="tel:+4559498630">
              59 49 86 30
            </a>{" "}
            så hjælper vi jer videre.
          </p>
        </div>
      </div>
    );
  }

  const trip = normalizeTrip(parsed.data);
  const galleryImages = destination?.gallery ?? [];
  const hasContact = !!trip.advisorEmail;

  // Issue #40: samme betingelser som de faktiske sektionskomponenter bruger
  // til at (ikke-)rendere sig selv, så desktop progress-nav aldrig peger på
  // et anker der ikke findes i DOM'en.
  const navSections = visibleNavSections({
    hasItinerary: trip.itinerary.length > 0,
    galleryImageCount: filterGalleryImages(galleryImages).length,
    hasHotels: trip.hotels.length > 0,
    hasContact,
  });

  // Vision 3.0 Fase 2 (Issue #71): samme render-sandhed som navSections
  // ovenfor, men begrænset til de fem Fase 2-sektioner (ALDRIG "intro" — en
  // kvalificeret åbning er allerede Fase 1B's ansvar). Trackeren observerer
  // udelukkende sektioner der faktisk findes i DOM'en for DENNE rejseplan.
  // Samme funktion håndhæver eligibility SERVER-side i engagement-endpointet
  // (src/lib/section-engagement-endpoint.ts) — klientens liste er kun UX/dedup.
  const eligibleSections = computeEligibleSectionsForTrip(trip, galleryImages);

  return (
    <div className="page">
      <Hero trip={trip} heroPhoto={row.hero_photo ?? destination?.heroUrl ?? null} />
      <TripDetails trip={trip} />
      <Timeline itinerary={trip.itinerary} />
      <DestinationGallery images={galleryImages} destination={trip.destination} />
      <Hotels hotels={trip.hotels} />
      <PriceAndNote trip={trip} />
      <ContactCTA trip={trip} />
      <Footer />
      <ProgressNav sections={navSections} />
      <ActionBar hasContact={hasContact} />
      <SectionEngagementTracker slug={params.bookingId} sections={eligibleSections} />
    </div>
  );
}
