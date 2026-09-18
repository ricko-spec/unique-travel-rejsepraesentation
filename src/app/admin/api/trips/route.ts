import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import {
  getSupabaseService,
  describeFetchError,
  envDiagnostics,
} from "@/lib/supabase/server";
import { tripSchema } from "@/lib/types";
import {
  markUploadEventPublished,
  markUploadEventSaveFailed,
  verifyUploadEventForPublish,
} from "@/lib/upload-events";
import { uniqueCreatorIds, resolveCreatedByName, type CreatorProfile } from "@/lib/trip-creator";
import {
  classifyTripEngagement,
  toTripEngagementListState,
  type RawTripVisitRow,
} from "@/lib/trip-engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  trip: tripSchema,
  heroPhoto: z.string().url().optional().nullable(),
  customerName: z.string().optional().nullable(),
  slugOverride: z.string().optional().nullable(),
  rawPdfText: z.string().optional().nullable(),
  uploadEventId: z.string().uuid(),
});

// ISSUE-38: sælgervendte fejlbeskeder for de tre måder verifikationen af et
// upload-event kan afvises på. Samme "besked er sælgervendt, detaljen bliver
// på serveren"-mønster som parse-errors.ts.
const UPLOAD_EVENT_REJECT_MESSAGES: Record<string, string> = {
  not_found: "Upload-registreringen blev ikke fundet. Upload PDF'en igen.",
  forbidden: "Upload-registreringen tilhører ikke din session. Upload PDF'en igen.",
  wrong_status: "Denne upload er allerede gemt eller udløbet. Upload PDF'en igen.",
  hash_mismatch:
    "Bookingnummeret matcher ikke den parsede upload. Upload PDF'en igen.",
};

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
        "id, booking_no, slug, destination, customer_name, hero_photo, active, created_at, updated_at, raw_pdf_text, data, created_by",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/trips] Supabase error", error);
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details, hint: error.hint },
        { status: 500 },
      );
    }

    const rows = data ?? [];

    // ISSUE-67: "Oprettet af" — ét samlet profiles-opslag for de unikke
    // created_by-id'er (aldrig ét opslag pr. trip). Fail-open: fejler
    // opslaget, viser listen bare "—" for alle i stedet for at fejle hele
    // GET'en — trip-listen er vigtigere end navnekolonnen.
    let creatorProfiles: CreatorProfile[] = [];
    const creatorIds = uniqueCreatorIds(rows.map((row) => row.created_by));
    if (creatorIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", creatorIds);

      if (profileError) {
        console.error("[GET /api/trips] Profiles-opslag (created_by) fejlede", profileError);
      } else {
        creatorProfiles = profileRows ?? [];
      }
    }

    // ISSUE-69: "Kundeaktivitet" — ét samlet trip_visits-opslag, IKKE
    // .in("trip_id", tripIds) (review-fund på PR #70): PostgREST lægger en
    // .in()-liste i selve request-URL'en, og med ~267+ trips (og voksende)
    // nærmer den sig Supabase/Cloudflares grænse for URL/header-størrelse
    // (520-fejl ved lange in-clauses, se Supabases eget troubleshooting-doc).
    // trip_visits har højst én række pr. trip (FK + cascade til trips), og
    // dette endpoint henter allerede ALLE trips — derfor er hver
    // trip_visits-række pr. definition relevant, og et almindeligt,
    // ufiltreret select er både korrekt og det simpleste: fortsat ét
    // set-baseret opslag, ingen N+1, intet URL-loft. "Ingen række" og
    // "opslaget fejlede" er bevidst forskellige tilstande (se
    // src/lib/trip-engagement.ts) — en fejl her må ALDRIG vises som "Ikke
    // åbnet endnu". Kun de fire kolonner UI'et rent faktisk bruger selectes;
    // trip_id bruges kun til at matche raden til den rigtige trip herunder,
    // sendes ikke i svaret.
    const visitRowsByTripId = new Map<string, RawTripVisitRow>();
    let visitReadFailed = false;
    const { data: visitRows, error: visitError } = await supabase
      .from("trip_visits")
      .select("trip_id, first_opened_at, last_opened_at, visit_count, open_count");

    if (visitError) {
      console.error("[GET /api/trips] trip_visits-opslag (Kundeaktivitet) fejlede", visitError);
      visitReadFailed = true;
    } else {
      for (const row of visitRows ?? []) {
        if (row.trip_id) visitRowsByTripId.set(row.trip_id, row);
      }
    }

    // created_by (den interne uuid) sendes aldrig til klienten — kun det
    // afledte, menneskelæsbare created_by_name. Samme princip for
    // Kundeaktivitet: kun den afledte, KOMPAKTE list-visningstilstand
    // (review-fund på PR #70) — hverken den rå trip_visits-række,
    // firstOpenedAt eller openCount forlader serveren her. Den fulde
    // TripEngagementState er kun til trip-detaljesiden (som henter sin egen
    // row server-side, se src/app/admin/trips/[id]/page.tsx).
    const trips = rows.map(({ created_by, ...rest }) => ({
      ...rest,
      created_by_name: resolveCreatedByName(created_by, creatorProfiles),
      engagement: toTripEngagementListState(
        classifyTripEngagement({
          visitRow: visitRowsByTripId.get(rest.id) ?? null,
          readFailed: visitReadFailed,
          tripCreatedAt: rest.created_at,
        }),
      ),
    }));

    return NextResponse.json({ trips });
  } catch (e) {
    const detail = describeFetchError(e);
    console.error("[GET /api/trips] Threw", e);
    // SEC-6: envDiagnostics() bliver på serveren — env-var-navne/-tilstedeværelse,
    // projekt-ref og nøgle-længder er driftssignaler, ikke noget klienten skal se
    // i et fejlsvar. describeFetchError() er allerede sanitiseret (netværks-/
    // driver-fejlkæde uden secrets).
    console.error("[GET /api/trips] Env diagnostics", envDiagnostics());
    return NextResponse.json({ error: `Kunne ikke hente: ${detail}` }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
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

  const { trip, heroPhoto, customerName, slugOverride, rawPdfText, uploadEventId } = parsed.data;
  const slug = slugOverride?.trim() || slugify(trip.bookingNo) || slugify(trip.destination);
  if (!slug) {
    return NextResponse.json({ error: "Kunne ikke generere et gyldigt slug" }, { status: 400 });
  }

  // ISSUE-38: eventet skal findes, tilhøre den aktuelle bruger, stå i
  // 'parsed'-status, og booking-hashen skal matche den trip vi forsøger at
  // gemme — ellers kan et fremmed eller genbrugt event ikke bruges til at
  // markere en upload som "published".
  const verification = await verifyUploadEventForPublish(uploadEventId, user.id, trip.bookingNo);
  if (!verification.ok) {
    console.error("[POST /api/trips] upload-event verifikation afvist", {
      uploadEventId,
      reason: verification.reason,
    });
    return NextResponse.json(
      { error: UPLOAD_EVENT_REJECT_MESSAGES[verification.reason] },
      { status: verification.reason === "forbidden" ? 403 : 400 },
    );
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
      await markUploadEventSaveFailed(uploadEventId, "save_error");
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
        await markUploadEventSaveFailed(uploadEventId, "save_conflict");
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
          // SEC-1: 'slug' må ALDRIG med i denne payload. Ved insert genererer
          // DB-defaulten en tilfældig 12-hex slug — den må ikke kunne blive
          // booking-nummeret (kundens adgangskode) eller andet gætbart.
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
          // PAIN-2: created_by sættes KUN i insert-grenen (ny booking_no).
          // Ved re-upload af eksisterende booking udelades feltet helt, så
          // upsert-updaten aldrig rører den oprindelige opretter.
          ...(wasUpdate ? {} : { created_by: user.id }),
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
        await markUploadEventSaveFailed(uploadEventId, "save_conflict");
        return NextResponse.json(
          { error: "Et booking-nr eller link med samme værdi findes allerede." },
          { status: 409 },
        );
      }
      await markUploadEventSaveFailed(uploadEventId, "save_error");
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

    await markUploadEventPublished(uploadEventId, data.id, wasUpdate ? "updated" : "created");

    return NextResponse.json({
      id: data.id,
      slug: data.slug,
      created: !wasUpdate,
      updated: wasUpdate,
    });
  } catch (e) {
    const detail = describeFetchError(e);
    // SEC-6: samme princip som GET ovenfor — diagnostics logges server-side,
    // aldrig i responsen.
    console.error("[POST /api/trips] Network/runtime error", e);
    console.error("[POST /api/trips] Env diagnostics", envDiagnostics());
    await markUploadEventSaveFailed(uploadEventId, "save_error");
    return NextResponse.json(
      { error: `Forbindelse til Supabase fejlede: ${detail}` },
      { status: 500 },
    );
  }
}
