import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import {
  getSupabaseService,
  describeFetchError,
  envDiagnostics,
} from "@/lib/supabase/server";
import { tripSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  trip: tripSchema,
  heroPhoto: z.string().url().optional().nullable(),
  customerName: z.string().optional().nullable(),
  slugOverride: z.string().optional().nullable(),
  rawPdfText: z.string().optional().nullable(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET() {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("trips")
      .select(
        "id, booking_no, slug, destination, customer_name, hero_photo, active, created_at, updated_at, raw_pdf_text, data",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/trips] Supabase error", error);
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details, hint: error.hint },
        { status: 500 },
      );
    }
    return NextResponse.json({ trips: data ?? [] });
  } catch (e) {
    const detail = describeFetchError(e);
    console.error("[GET /api/trips] Threw", e);
    console.error("[GET /api/trips] Env diagnostics", envDiagnostics());
    return NextResponse.json(
      { error: `Kunne ikke hente: ${detail}`, env: envDiagnostics() },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldige data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { trip, heroPhoto, customerName, slugOverride, rawPdfText } = parsed.data;
  const slug = slugOverride?.trim() || slugify(trip.bookingNo) || slugify(trip.destination);
  if (!slug) {
    return NextResponse.json({ error: "Kunne ikke generere et gyldigt slug" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseService();

    // Pre-check: does a row with this booking_no already exist? That tells us
    // whether this upsert will create or update — and we report it to the UI.
    const existingByBooking = await supabase
      .from("trips")
      .select("id, slug")
      .eq("booking_no", trip.bookingNo)
      .maybeSingle();

    if (existingByBooking.error) {
      console.error("[POST /api/trips] Pre-check failed", existingByBooking.error);
      return NextResponse.json(
        { error: existingByBooking.error.message, code: existingByBooking.error.code },
        { status: 500 },
      );
    }

    const wasUpdate = !!existingByBooking.data;

    // If the slug is changing (or this is a fresh insert with a chosen slug),
    // make sure it isn't already taken by a *different* booking — surface a
    // helpful message instead of the generic 23505.
    if (!wasUpdate || existingByBooking.data?.slug !== slug) {
      const slugCollision = await supabase
        .from("trips")
        .select("booking_no")
        .eq("slug", slug)
        .neq("booking_no", trip.bookingNo)
        .maybeSingle();

      if (slugCollision.error) {
        console.error("[POST /api/trips] Slug collision check failed", slugCollision.error);
      } else if (slugCollision.data) {
        return NextResponse.json(
          {
            error: `Link-slug "${slug}" er allerede i brug af booking #${slugCollision.data.booking_no}. Vælg et andet.`,
          },
          { status: 409 },
        );
      }
    }

    console.log("[POST /api/trips] Upserting", {
      slug,
      booking_no: trip.bookingNo,
      destination: trip.destination,
      wasUpdate,
      env: envDiagnostics(),
    });

    const { data, error } = await supabase
      .from("trips")
      .upsert(
        {
          booking_no: trip.bookingNo,
          destination: trip.destination,
          customer_name: customerName ?? null,
          // Fang den friske AI-intro som introOriginal, så "Gendan AI-tekst" i
          // admin kan rulle en sælger-redigering tilbage. Re-upload regenererer
          // intro'en og opdaterer dermed også originalen.
          data: { ...trip, introOriginal: trip.introOriginal ?? trip.intro },
          hero_photo: heroPhoto ?? null,
          // Re-uploading a PDF is an implicit "make this live" signal; lift any
          // prior soft-delete so the customer link works again.
          raw_pdf_text: rawPdfText ?? null,
          active: true,
        },
        { onConflict: "booking_no" },
      )
      .select("id, slug")
      .single();

    if (error) {
      console.error("[POST /api/trips] Supabase error", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Et booking-nr eller link med samme værdi findes allerede." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      slug: data.slug,
      created: !wasUpdate,
      updated: wasUpdate,
    });
  } catch (e) {
    const detail = describeFetchError(e);
    const diag = envDiagnostics();
    console.error("[POST /api/trips] Network/runtime error", e);
    console.error("[POST /api/trips] Env diagnostics", diag);
    return NextResponse.json(
      {
        error: `Forbindelse til Supabase fejlede: ${detail}`,
        env: diag,
      },
      { status: 500 },
    );
  }
}
