import { z } from "zod";

// ----- helpers -----
// Accept null/undefined/anything coercible to string; default to "".
const looseStr = z.preprocess(
  (v) => (v == null ? "" : typeof v === "string" ? v : String(v)),
  z.string(),
);

// Accept null/undefined/strings/numbers; default to 0.
const looseNum = z.preprocess((v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}, z.number());

// Array of strings, but tolerant of null/undefined and non-string items.
const looseStrArray = z.preprocess((v) => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x != null)
    .map((x) => (typeof x === "string" ? x : String(x)));
}, z.array(z.string()));

// ----- schemas -----
export const obsSchema = z
  .object({
    title: looseStr,
    text: looseStr,
  })
  .passthrough();

export const programExpandSchema = z
  .object({
    days: z
      .array(
        z
          .object({
            label: looseStr,
            text: looseStr,
            meal: looseStr.optional().nullable(),
          })
          .passthrough(),
      )
      .default([]),
    included: looseStrArray.default([]),
  })
  .passthrough();

export const activitiesExpandSchema = z
  .object({
    activities: z
      .array(
        z
          .object({
            title: looseStr,
            desc: looseStr,
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export const flightExpandSchema = z
  .object({
    details: z
      .array(
        z
          .object({
            label: looseStr,
            value: looseStr,
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

// expand: discriminate by expandKind on the parent, not by structure here —
// so accept any combination of shapes.
const expandSchema = z
  .object({
    days: programExpandSchema.shape.days.optional(),
    included: programExpandSchema.shape.included.optional(),
    activities: activitiesExpandSchema.shape.activities.optional(),
    details: flightExpandSchema.shape.details.optional(),
  })
  .passthrough();

export const itineraryItemSchema = z
  .object({
    id: looseNum.optional().default(0),
    type: z
      .preprocess(
        (v) => (typeof v === "string" ? v.toLowerCase() : v),
        z.enum(["flight", "hotel", "transfer", "activity"]),
      ),
    typeLabel: looseStr,
    title: looseStr,
    details: looseStr.optional().default(""),
    chips: looseStrArray.optional().nullable(),
    obs: obsSchema.optional().nullable(),
    expandKind: z
      .preprocess(
        (v) => (typeof v === "string" ? v.toLowerCase() : v),
        z.enum(["program", "activities", "flight"]),
      )
      .optional()
      .nullable(),
    expand: expandSchema.optional().nullable(),
  })
  .passthrough();

export const hotelSchema = z
  .object({
    name: looseStr,
    location: looseStr.optional().default(""),
    nights: looseNum.optional().default(0),
    room: looseStr.optional().default(""),
    meals: looseStr.optional().default(""),
    checkIn: looseStr.optional().default(""),
    checkOut: looseStr.optional().default(""),
  })
  .passthrough();

export const tripSchema = z
  .object({
    bookingNo: looseStr,
    destination: looseStr,
    subtitle: looseStr.optional().default(""),
    departure: looseStr.optional().default(""),
    return: looseStr.optional().default(""),
    travellers: looseStr.optional().default(""),
    advisor: looseStr.optional().default(""),
    // Udfyldes server-side efter parse via opslag i profiles.advisor_match_name.
    // null = ingen matchende profil.
    advisorEmail: z.string().nullable().optional(),
    advisorPhone: z.string().nullable().optional(),
    heroPhoto: looseStr.optional().nullable(),
    intro: looseStr.optional().default(""),
    itinerary: z.array(itineraryItemSchema).default([]),
    hotels: z.array(hotelSchema).default([]),
    price: z
      .preprocess(
        (v) => (v == null ? {} : v),
        z
          .object({
            total: looseStr.optional().default(""),
            perPerson: looseStr.optional().default(""),
            note: looseStr.optional().default(""),
          })
          .passthrough(),
      )
      .default({ total: "", perPerson: "", note: "" }),
    practicalNote: looseStr.optional().default(""),
  })
  .passthrough();

export type Obs = z.infer<typeof obsSchema>;
export type ProgramExpand = z.infer<typeof programExpandSchema>;
export type ActivitiesExpand = z.infer<typeof activitiesExpandSchema>;
export type FlightExpand = z.infer<typeof flightExpandSchema>;
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type Hotel = z.infer<typeof hotelSchema>;
export type Trip = z.infer<typeof tripSchema>;

export type TripRow = {
  id: string;
  booking_no: string;
  slug: string;
  destination: string;
  customer_name: string | null;
  data: Trip;
  hero_photo: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// Post-validate normalization: ensure every itinerary item has a stable, unique id.
export function normalizeTrip(trip: Trip): Trip {
  return {
    ...trip,
    itinerary: trip.itinerary.map((item, i) => ({
      ...item,
      id: item.id && item.id > 0 ? item.id : i + 1,
    })),
  };
}
