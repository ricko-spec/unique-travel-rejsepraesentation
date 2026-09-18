import { getSupabaseService } from "./supabase/server";
import { pickDestinationMatch, type DestinationRecord } from "./destination-match";

// Destinationens hero/galleri for en rejse. ÉT opslag, delt af kundesiden
// (src/app/[bookingId]/page.tsx) og engagement-endpointet
// (src/app/[bookingId]/engagement/route.ts), så begge altid afgør "har denne
// rejseplan et galleri" ud fra præcis samme data.
export async function getDestination(name: string) {
  const supabase = getSupabaseService();
  // Hent alle destinationer (få rækker) og match i prioritetsrækkefølge — hele
  // navnet først, ellers hvert land-segment af en kombi-destination. Et eksakt
  // .eq-match fejler for "Sri Lanka & Maldiverne" o.l., hvor tabellen kun har
  // landene enkeltvis; det gav flad fallback-hero selv om landets billede fandtes.
  const { data } = await supabase.from("destinations").select("name, hero_url, gallery");
  return pickDestinationMatch((data as DestinationRecord[]) ?? [], name);
}
