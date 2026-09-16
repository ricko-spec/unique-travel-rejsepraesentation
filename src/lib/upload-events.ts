import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "./supabase/server";

// upload_events er adoption/usage-loggen for Issue #38 — ét event pr.
// accepteret PDF-upload til /admin/api/parse, adskilt fra trips.created_by
// (som kun sporer den oprindelige opretter og aldrig rører sig ved
// re-upload). Se supabase/009_upload_events.sql for statusflow og skema.

export type UploadEventStatus =
  | "received"
  | "validation_failed"
  | "parse_failed"
  | "parsed"
  | "published"
  | "save_failed";

export type UploadEventFailureKind =
  | "file_too_large"
  | "invalid_file_type"
  | "invalid_json"
  | "schema_mismatch"
  | "max_tokens"
  | "anthropic_error"
  | "event_mismatch"
  | "save_conflict"
  | "save_error";

export type UploadEvent = {
  id: string;
  user_id: string | null;
  actor_name: string;
  received_at: string;
  updated_at: string;
  completed_at: string | null;
  status: UploadEventStatus;
  file_size_bytes: number | null;
  booking_no_hash: string | null;
  trip_id: string | null;
  save_kind: "created" | "updated" | null;
  failure_kind: UploadEventFailureKind | null;
};

// sha-256 af bookingnummeret. Bookingnummeret er kundens adgangskode til
// præsentationen og må ALDRIG gemmes i klartekst i usage-loggen — kun denne
// hash, til at korrelere et upload-event med den trip der (måske) blev gemt.
export function hashBookingNo(bookingNo: string): string {
  return createHash("sha256").update(bookingNo.trim(), "utf8").digest("hex");
}

// Navnesnapshot til actor_name: profilens fulde navn hvis den findes og har
// et navn, ellers email, ellers user id. Bevares uafhængigt af senere
// ændringer/sletning af profilen (jf. 100%-tracking-princippet — vi må ikke
// miste hvem der uploadede fordi et efterfølgende profilopslag fejler).
export async function resolveActorName(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (!error && data?.full_name?.trim()) {
      return data.full_name.trim();
    }
  } catch (e) {
    console.warn("[upload-events] resolveActorName profil-opslag fejlede:", e);
  }
  return user.email ?? user.id;
}

// ERR-1/DATA-2: fail-closed oprettelse af upload-eventet. Kaldes FØR Claude
// parser PDF'en. Fejler dette insert, må parse-routen IKKE kalde Claude —
// ellers kan en behandlet upload eksistere uden at være talt med.
export async function createUploadEvent(input: {
  userId: string;
  actorName: string;
  fileSizeBytes: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: unknown }> {
  try {
    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("upload_events")
      .insert({
        user_id: input.userId,
        actor_name: input.actorName,
        file_size_bytes: input.fileSizeBytes,
        status: "received",
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[upload-events] createUploadEvent insert error:", error);
      return { ok: false, error };
    }
    return { ok: true, id: data.id as string };
  } catch (e) {
    console.error("[upload-events] createUploadEvent threw:", e);
    return { ok: false, error: e };
  }
}

// Statusopdateringer må aldrig kunne slette/miste det oprindelige
// 'received'-event: dette er altid en UPDATE på den eksisterende række,
// aldrig et insert. Fejler UPDATE'en, bliver eventet stående i sin
// nuværende status (typisk 'received') — synligt som "ufærdiggjort" i
// brugsoverblikket i stedet for at forsvinde.
async function updateUploadEvent(
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  try {
    const supabase = getSupabaseService();
    const { error } = await supabase.from("upload_events").update(patch).eq("id", id);
    if (error) {
      console.error("[upload-events] update error:", { id, patch, error });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[upload-events] update threw:", { id, patch, error: e });
    return false;
  }
}

export function markUploadEventFailed(
  id: string,
  status: "validation_failed" | "parse_failed",
  failureKind: UploadEventFailureKind,
): Promise<boolean> {
  return updateUploadEvent(id, { status, failure_kind: failureKind });
}

export function markUploadEventParsed(
  id: string,
  bookingNoHash: string,
): Promise<boolean> {
  return updateUploadEvent(id, { status: "parsed", booking_no_hash: bookingNoHash });
}

export function markUploadEventPublished(
  id: string,
  tripId: string,
  saveKind: "created" | "updated",
): Promise<boolean> {
  return updateUploadEvent(id, {
    status: "published",
    trip_id: tripId,
    save_kind: saveKind,
    completed_at: new Date().toISOString(),
  });
}

export function markUploadEventSaveFailed(
  id: string,
  failureKind: UploadEventFailureKind,
): Promise<boolean> {
  return updateUploadEvent(id, { status: "save_failed", failure_kind: failureKind });
}

// Verificerer et uploadEventId inden POST /admin/api/trips gemmer en trip —
// forhindrer at en fremmed brugers event genbruges, og at et event der ikke
// hører til den booking der forsøges gemt, bruges (booking-hash-mismatch).
export type UploadEventVerification =
  | { ok: true; event: UploadEvent }
  | { ok: false; reason: "not_found" | "forbidden" | "wrong_status" | "hash_mismatch" };

export async function verifyUploadEventForPublish(
  uploadEventId: string,
  userId: string,
  bookingNo: string,
): Promise<UploadEventVerification> {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from("upload_events")
    .select("*")
    .eq("id", uploadEventId)
    .maybeSingle();

  if (error) {
    console.error("[upload-events] verifyUploadEventForPublish read error:", error);
    return { ok: false, reason: "not_found" };
  }
  return evaluateUploadEventForPublish(data as UploadEvent | null, userId, bookingNo);
}

// Ren beslutningslogik udskilt fra DB-kaldet ovenfor, så den kan unit-testes
// uden en levende Supabase-forbindelse.
export function evaluateUploadEventForPublish(
  event: UploadEvent | null,
  userId: string,
  bookingNo: string,
): UploadEventVerification {
  if (!event) return { ok: false, reason: "not_found" };
  if (event.user_id !== userId) return { ok: false, reason: "forbidden" };
  if (event.status !== "parsed") return { ok: false, reason: "wrong_status" };
  if (event.booking_no_hash !== hashBookingNo(bookingNo)) {
    return { ok: false, reason: "hash_mismatch" };
  }
  return { ok: true, event };
}
