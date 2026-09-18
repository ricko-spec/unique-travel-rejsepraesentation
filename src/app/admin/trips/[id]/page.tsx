import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import type { Trip } from "@/lib/types";
import { classifyTripEngagement, type RawTripVisitRow } from "@/lib/trip-engagement";
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

  // ISSUE-69: "Kundeaktivitet" — trip_visits' trip_id ER params.id (FK til
  // trips.id), så opslaget kan køre PARALLELT med trip-hentningen i stedet
  // for at vente på den. Findes trippen ikke, kasseres visitResult blot
  // ubrugt nedenfor. "Ingen række" og "opslaget fejlede" er bevidst
  // forskellige tilstande — se src/lib/trip-engagement.ts. En analytics-fejl
  // må ALDRIG blokere sælgerens adgang til resten af siden.
  const [tripResult, visitResult] = await Promise.all([
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

  return (
    <TripDetail
      id={row.id}
      slug={row.slug}
      bookingNo={row.booking_no}
      destination={row.destination}
      customerName={row.customer_name}
      data={row.data}
      engagement={engagement}
    />
  );
}
