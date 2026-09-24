// Vision 3.0 Fase 5, Gate B (Issue #80) — eksplicit wire-DTO for
// GET /admin/api/conversion (PR #81 review-runde 1, fund 6).
//
// JSON kan ikke bære Date-objekter. Serveren konverterer derfor ALLE datoer
// til ISO-8601-strenge her (`toConversionWire`), og klienten validerer den
// modtagne JSON med et zod-skema (`parseConversionWire`) i stedet for at
// caste den til en type med Date-felter. Ingen dato-metoder kaldes nogensinde
// på en ukontrolleret værdi i UI'et.

import { z } from "zod";
import type { ConversionAggregate } from "./aggregate";

const nullableCount = z.number().int().nonnegative().nullable();

const windowCell = z.object({
  denominator: nullableCount,
  numerator: nullableCount,
  ratePercent: z.number().nullable(),
  suppressed: z.boolean(),
});

const trendPeriod = z.object({
  fromMonth: z.string().regex(/^\d{4}-\d{2}$/),
  toMonth: z.string().regex(/^\d{4}-\d{2}$/),
  enrolled: z.number().int().nonnegative(),
  booked: z.number().int().nonnegative(),
  ratePercent: z.number(),
});

const groupStats = z.object({
  totalEnrolled: nullableCount,
  windows: z.object({ "30": windowCell, "60": windowCell, "90": windowCell }),
  trend30: z.array(trendPeriod),
});

const isoOrNull = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "ugyldig ISO-dato")
  .nullable();

export const conversionWireSchema = z.object({
  measurement: z.object({
    status: z.enum(["NOT_STARTED", "ACTIVE", "PAUSED"]),
    contractVersion: z.number().int(),
    measurementStartedAt: isoOrNull,
    lastSuccessfulSyncAt: isoOrNull,
  }),
  freshness: z.enum(["NO_SYNC", "FRESH", "STALE"]),
  hasPublishableComparison: z.boolean(),
  groups: z.object({ ONLINE: groupStats, PDF_ONLY: groupStats }),
  differencePercentPoints: z.object({ "30": z.number().nullable(), "60": z.number().nullable(), "90": z.number().nullable() }),
  dataQuality: z.object({
    totalObserved: nullableCount,
    eligiblePending: nullableCount,
    preStartExisting: nullableCount,
    bookingConflicts: nullableCount,
    excludedByReason: z.object({
      MISSING_BOOKING_NO: nullableCount,
      INVALID_BOOKING_NO_FORMAT: nullableCount,
      SHARED_BOOKING_REFERENCE: nullableCount,
      CLOSED_BEFORE_QUALIFIED_OBSERVATION: nullableCount,
    }),
    lostObserved: nullableCount,
    outcomeConflicts: nullableCount,
  }),
});

export type ConversionWire = z.infer<typeof conversionWireSchema>;

export function toConversionWire(agg: ConversionAggregate): ConversionWire {
  return {
    ...agg,
    measurement: {
      status: agg.measurement.status,
      contractVersion: agg.measurement.contractVersion,
      measurementStartedAt: agg.measurement.measurementStartedAt?.toISOString() ?? null,
      lastSuccessfulSyncAt: agg.measurement.lastSuccessfulSyncAt?.toISOString() ?? null,
    },
  };
}

/** Validerer ukendt JSON fra API'et. `null` ⇒ UI'et viser en fejltilstand, aldrig et kast. */
export function parseConversionWire(json: unknown): ConversionWire | null {
  const parsed = conversionWireSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
