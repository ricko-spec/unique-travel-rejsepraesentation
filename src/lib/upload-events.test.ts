import { describe, it, expect } from "vitest";
import { evaluateUploadEventForPublish, hashBookingNo, type UploadEvent } from "./upload-events";

function makeEvent(overrides: Partial<UploadEvent> = {}): UploadEvent {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "user-1",
    actor_name: "Anne Berg",
    received_at: "2026-09-16T10:00:00.000Z",
    updated_at: "2026-09-16T10:00:05.000Z",
    completed_at: null,
    status: "parsed",
    file_size_bytes: 123456,
    booking_no_hash: hashBookingNo("35685"),
    trip_id: null,
    save_kind: null,
    failure_kind: null,
    ...overrides,
  };
}

describe("hashBookingNo", () => {
  it("er deterministisk for samme input", () => {
    expect(hashBookingNo("35685")).toBe(hashBookingNo("35685"));
  });

  it("er forskellig for forskellige bookingnumre", () => {
    expect(hashBookingNo("35685")).not.toBe(hashBookingNo("35682"));
  });

  it("trimmer whitespace før hashning", () => {
    expect(hashBookingNo("35685")).toBe(hashBookingNo(" 35685 "));
  });

  it("gemmer aldrig bookingnummeret i klartekst i hash-outputtet", () => {
    expect(hashBookingNo("35685")).not.toContain("35685");
  });
});

describe("evaluateUploadEventForPublish", () => {
  it("afviser når eventet ikke findes (Test-case 1: manglende event stopper uploaden)", () => {
    const result = evaluateUploadEventForPublish(null, "user-1", "35685");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("afviser når eventet tilhører en anden bruger (Test-case 6: fremmed uploadEventId)", () => {
    const event = makeEvent({ user_id: "user-2" });
    const result = evaluateUploadEventForPublish(event, "user-1", "35685");
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("afviser når eventet ikke står i 'parsed'-status", () => {
    const event = makeEvent({ status: "published" });
    const result = evaluateUploadEventForPublish(event, "user-1", "35685");
    expect(result).toEqual({ ok: false, reason: "wrong_status" });
  });

  it("afviser ved booking-hash-mismatch (Test-case 7)", () => {
    const event = makeEvent({ booking_no_hash: hashBookingNo("99999") });
    const result = evaluateUploadEventForPublish(event, "user-1", "35685");
    expect(result).toEqual({ ok: false, reason: "hash_mismatch" });
  });

  it("godkender et gyldigt event for den rigtige bruger og booking", () => {
    const event = makeEvent();
    const result = evaluateUploadEventForPublish(event, "user-1", "35685");
    expect(result).toEqual({ ok: true, event });
  });
});
