import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import type { Trip } from "@/lib/types";
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
};

export default async function TripDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!(await getSessionUser())) redirect("/admin");

  const supabase = getSupabaseService();
  const { data } = await supabase
    .from("trips")
    .select("id, booking_no, slug, destination, customer_name, active, data")
    .eq("id", params.id)
    .maybeSingle();

  if (!data) notFound();
  const row = data as TripRow;

  return (
    <TripDetail
      id={row.id}
      slug={row.slug}
      bookingNo={row.booking_no}
      destination={row.destination}
      customerName={row.customer_name}
      data={row.data}
    />
  );
}
