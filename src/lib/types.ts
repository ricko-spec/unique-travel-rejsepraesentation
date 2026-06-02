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
    dateLabel: looseStr.optional().default(""),
  })
  .passthrough();

export const alternativeHotelSchema = z
  .object({
    name: looseStr,
    description: looseStr.optional().default(""),
    nights: looseNum.optional().default(0),
    meals: looseStr.optional().default(""),
    savings: looseStr.optional().default(""),
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
    roomAllocations: z.array(looseStr).optional().default([]),
    alternative: alternativeHotelSchema.nullable().optional(),
    isPackage: z.boolean().optional().default(false),
    subHotels: z
      .array(
        z
          .object({
            name: looseStr,
            location: looseStr.optional().default(""),
            room: looseStr.optional().default(""),
            nights: looseNum.optional().default(0),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    included: z.array(looseStr).optional().default([]),
    notIncluded: z.array(looseStr).optional().default([]),
    notes: z.array(looseStr).optional().default([]),
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
function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

function pickNum(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && v > 0) return v;
  }
  return 0;
}

// ----- Danish date helpers (for itinerary dateLabel fallback) -----
const DK_WEEKDAYS = ["SØN", "MAN", "TIR", "ONS", "TOR", "FRE", "LØR"] as const;
const DK_WEEKDAYS_FULL = [
  "søndag",
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
] as const;
const DK_MONTHS_FULL = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];
const DK_MONTHS_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAJ",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OKT",
  "NOV",
  "DEC",
] as const;

function parseDanishDate(s: string): Date | null {
  // Matches '27. december 2026' (evt. med ugedag eller komma foran).
  const m = s.match(/(\d{1,2})\.\s*([a-zæøå]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthIdx = DK_MONTHS_FULL.indexOf(m[2].toLowerCase());
  const year = parseInt(m[3], 10);
  if (monthIdx < 0 || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const d = new Date(Date.UTC(year, monthIdx, day));
  return Number.isFinite(d.getTime()) ? d : null;
}

// Parser både ISO ('2027-03-31') og dansk ('31. marts 2027') dato-streng til en
// UTC Date. Returnerer null hvis ingen af formerne matcher.
function parseFlexibleDate(s: string): Date | null {
  const trimmed = s.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    if (m < 0 || m > 11) return null;
    const date = new Date(Date.UTC(y, m, d));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return parseDanishDate(trimmed);
}

// Format dato som 'torsdag 21. november 2025' (dansk langform med ugedag).
// Falder tilbage til original streng hvis input ikke kan parses.
export function formatLongDateDK(s: string | null | undefined): string {
  if (!s) return "";
  const date = parseFlexibleDate(s);
  if (!date) return s;
  const wd = DK_WEEKDAYS_FULL[date.getUTCDay()];
  return `${wd} ${date.getUTCDate()}. ${DK_MONTHS_FULL[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

function formatShortDateDK(d: Date, withMonth: boolean): string {
  const wd = DK_WEEKDAYS[d.getUTCDay()];
  const day = d.getUTCDate();
  if (!withMonth) return `${wd} ${day}.`;
  const mon = DK_MONTHS_ABBR[d.getUTCMonth()];
  return `${wd} ${day}. ${mon}`;
}

function parseDayRangeFromTypeLabel(label: string): { start: number; end: number } | null {
  const range = label.match(/DAG\s+(\d+)\s*[–-]\s*(\d+)/i);
  if (range) {
    return { start: parseInt(range[1], 10), end: parseInt(range[2], 10) };
  }
  const single = label.match(/DAG\s+(\d+)/i);
  if (single) {
    const n = parseInt(single[1], 10);
    return { start: n, end: n };
  }
  return null;
}

function computeDateLabel(typeLabel: string, departure: string): string {
  if (!typeLabel || !departure) return "";
  const range = parseDayRangeFromTypeLabel(typeLabel);
  if (!range) return "";
  const start = parseFlexibleDate(departure);
  if (!start) return "";
  const startDate = addDaysUTC(start, range.start - 1);
  const endDate = addDaysUTC(start, range.end - 1);
  if (range.start === range.end) {
    return formatShortDateDK(startDate, true);
  }
  const sameMonth =
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth();
  if (sameMonth) {
    return `${formatShortDateDK(startDate, false)} – ${formatShortDateDK(endDate, true)}`;
  }
  return `${formatShortDateDK(startDate, true)} – ${formatShortDateDK(endDate, true)}`;
}

// Map legacy itinerary-item shapes (times/summary/timeLabel/info/flight-sibling)
// back to the canonical chips/details/typeLabel/obs/expandKind+expand fields the
// renderer expects. Lets existing trips with the older shape render correctly
// without re-parsing the PDF.
function normalizeItineraryItem(
  item: ItineraryItem,
  index: number,
  departure: string,
): ItineraryItem {
  const raw = item as Record<string, unknown>;

  const typeLabel = pickStr(item.typeLabel, raw.timeLabel);
  const dateLabel = pickStr(item.dateLabel, computeDateLabel(typeLabel, departure));
  const details = pickStr(item.details, raw.summary);
  const chips =
    item.chips && item.chips.length > 0
      ? item.chips
      : Array.isArray(raw.times) && raw.times.length > 0
        ? (raw.times.filter((x) => typeof x === "string") as string[])
        : (item.chips ?? null);

  let obs = item.obs ?? null;
  if (!obs && raw.info && typeof raw.info === "object") {
    const info = raw.info as Record<string, unknown>;
    const t = pickStr(info.title);
    const x = pickStr(info.text, info.body);
    if (t || x) obs = { title: t, text: x };
  }

  let expandKind = item.expandKind ?? null;
  let expand = item.expand ?? null;

  if (!expandKind) {
    const flight = raw.flight as Record<string, unknown> | undefined;
    const turprogram = raw.turprogram as Record<string, unknown> | undefined;
    const aktivitet = raw.aktivitet as Record<string, unknown> | undefined;

    if (flight && typeof flight === "object") {
      const detaljer = (flight.detaljer ?? flight.details) as unknown;
      if (Array.isArray(detaljer) && detaljer.length > 0) {
        expandKind = "flight";
        expand = { details: detaljer as { label: string; value: string }[] };
      } else {
        const rows: { label: string; value: string }[] = [];
        const flyArr = Array.isArray(flight.fly) ? flight.fly : [];
        const fly = (flyArr[0] as Record<string, unknown> | undefined) ?? undefined;
        const operator = Array.isArray(flight.operator)
          ? flight.operator.filter((x) => typeof x === "string").join(" · ")
          : pickStr(flight.operator);
        const flynummer = pickStr(flight.flynummer);
        if (flynummer) rows.push({ label: "Flynummer", value: flynummer });
        if (operator) rows.push({ label: "Selskab", value: operator });

        // afgang/ankomst kan ligge top-level på flight (Maldiverne-shape: pre-formatteret streng)
        // eller inde i fly[0] (Hanne Krogh-shape: kun tid-suffix der skal join'es med fra/dato).
        const topAfgang = pickStr(flight.afgang);
        const topAnkomst = pickStr(flight.ankomst);
        if (fly || topAfgang || topAnkomst) {
          const dato = pickStr(fly?.dato);
          const fra = pickStr(fly?.fra);
          const til = pickStr(fly?.til);
          const flyAfgang = pickStr(fly?.afgang);
          const flyAnkomst = pickStr(fly?.ankomst);
          const afgangValue =
            topAfgang || (fra ? [fra, dato, flyAfgang].filter(Boolean).join(" · ") : "");
          const ankomstValue =
            topAnkomst || (til ? [til, dato, flyAnkomst].filter(Boolean).join(" · ") : "");
          if (afgangValue) rows.push({ label: "Afgang", value: afgangValue });
          if (ankomstValue) rows.push({ label: "Ankomst", value: ankomstValue });
        }
        const varighed = pickStr(flight.varighed);
        if (varighed) rows.push({ label: "Varighed", value: varighed });
        const mellemlanding = pickStr(flight.mellemlanding);
        if (mellemlanding) rows.push({ label: "Mellemlanding", value: mellemlanding });
        if (rows.length > 0) {
          expandKind = "flight";
          expand = { details: rows };
        }
      }
    } else if (turprogram && typeof turprogram === "object") {
      expandKind = "program";
      expand = turprogram as Record<string, unknown>;
    } else if (aktivitet && typeof aktivitet === "object") {
      const stations = Array.isArray(aktivitet.stations) ? aktivitet.stations : [];
      const activities = stations
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          title: pickStr(s.title, s.titel),
          desc: pickStr(s.desc, s.varighed, s.beskrivelse),
        }));
      if (activities.length > 0) {
        expandKind = "activities";
        expand = { activities };
      }
    }
  }

  return {
    ...item,
    id: item.id && item.id > 0 ? item.id : index + 1,
    typeLabel,
    dateLabel,
    details,
    chips,
    obs,
    expandKind,
    expand,
  };
}

export function normalizeTrip(trip: Trip): Trip {
  const departure = trip.departure ?? "";
  return {
    ...trip,
    itinerary: trip.itinerary.map((item, i) => normalizeItineraryItem(item, i, departure)),
    hotels: (trip.hotels ?? []).map((h) => {
      const anyH = h as Record<string, unknown>;
      return {
        ...h,
        name: pickStr(h.name, anyH.navn),
        location: pickStr(h.location, anyH.lokation),
        nights: pickNum(h.nights, anyH["n\u00e6tter"]),
        room: pickStr(h.room, anyH["v\u00e6relse"]),
        meals: pickStr(h.meals, anyH["m\u00e5ltider"]),
        checkIn: pickStr(h.checkIn, anyH.checkInd),
        checkOut: pickStr(h.checkOut, anyH.checkUd),
      };
    }),
  };
}
