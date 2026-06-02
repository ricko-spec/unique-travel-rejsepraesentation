import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TripRow = {
  id: string;
  booking_no: string;
  slug: string;
  destination: string;
  customer_name: string | null;
  hero_photo: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  raw_pdf_text: string | null;
  data: unknown;
};

async function getTripWithRaw(slug: string): Promise<TripRow | null> {
  const supabase = getSupabaseService();
  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return data as TripRow;
}

export default async function QaPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!(await getSessionUser())) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-sand-page p-8">
        <p className="text-grey-text">Ikke logget ind.</p>
      </main>
    );
  }

  const trip = await getTripWithRaw(params.slug);
  if (!trip) notFound();

  const rawText = trip.raw_pdf_text ?? "(Ingen rå PDF-tekst gemt for denne rejse — uploadet før QA-feature blev tilføjet.)";
  const jsonPretty = JSON.stringify(trip.data, null, 2);

  return (
    <main className="min-h-screen bg-sand-page p-6 md:p-10">
      <div className="max-w-screen-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-gold mb-1">
              Sammenligning
            </p>
            <h1 className="font-serif text-3xl text-rainforest">
              #{trip.booking_no} · {trip.destination}
            </h1>
            <p className="text-sm text-grey-text mt-1">
              Slug: <span className="font-mono">{trip.slug}</span> · {trip.customer_name ?? ""}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-rainforest hover:text-rainforest-deep underline"
          >
            ← Tilbage til admin
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-sand rounded-2xl p-5 shadow-sm">
            <h2 className="font-serif text-xl text-rainforest mb-3">
              Rå PDF-tekst
            </h2>
            <p className="text-xs text-grey-text mb-3">
              Sådan ser PDF’en ud før Claude tolker den. Brug denne kolonne til at se hvad der står på papiret.
            </p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-sand/40 border border-sand rounded-lg p-4 max-h-[70vh] overflow-auto text-stone-800">
              {rawText}
            </pre>
          </section>

          <section className="bg-white border border-sand rounded-2xl p-5 shadow-sm">
            <h2 className="font-serif text-xl text-rainforest mb-3">
              Parsed JSON (det kunden ser)
            </h2>
            <p className="text-xs text-grey-text mb-3">
              Sådan har Claude struktureret indholdet. Hvis noget mangler i højre kolonne men findes i venstre, så skal Claude-prompten justeres.
            </p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-sand/40 border border-sand rounded-lg p-4 max-h-[70vh] overflow-auto text-stone-800">
              {jsonPretty}
            </pre>
          </section>
        </div>
      </div>
    </main>
  );
}
