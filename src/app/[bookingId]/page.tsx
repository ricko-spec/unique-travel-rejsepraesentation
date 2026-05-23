import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabaseService } from "@/lib/supabase/server";
import { tripSchema, type TripRow } from "@/lib/types";
import { Hero } from "@/components/trip/Hero";
import { TripDetails } from "@/components/trip/TripDetails";
import { Timeline } from "@/components/trip/Timeline";
import { Hotels } from "@/components/trip/Hotels";
import { PriceAndNote } from "@/components/trip/PriceAndNote";
import { ContactCTA } from "@/components/trip/ContactCTA";
import { Footer } from "@/components/trip/Footer";
import { ActionBar } from "@/components/trip/ActionBar";

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
    robots: { index: false, follow: false },
  };
}

export default async function TripPage({ params }: { params: { bookingId: string } }) {
  const row = await loadTrip(params.bookingId);
  if (!row) notFound();

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

  const trip = parsed.data;

  return (
    <div className="page">
      <Hero trip={trip} heroPhoto={row.hero_photo} />
      <TripDetails trip={trip} />
      <Timeline itinerary={trip.itinerary} />
      <Hotels hotels={trip.hotels} />
      <PriceAndNote trip={trip} />
      <ContactCTA trip={trip} />
      <Footer />
      <ActionBar />
    </div>
  );
}
