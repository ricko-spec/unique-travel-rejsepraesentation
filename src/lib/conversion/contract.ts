// Vision 3.0 Fase 5, Gate B (Issue #80) — versioneret pipeline-/stage-/felt-
// kontrakt. Bindende fakta fra Gate A (Issue #78, PR #79), gentages IKKE som
// ny beslutning her — kun kodet som konstanter, så en fremtidig ændring i
// HubSpot (nyt stage-id, ny pipeline) bliver en eksplicit, versioneret
// kontraktdrift-hændelse (fail-closed sync), ikke en stille fejlklassifikation.
//
// CONTRACT_VERSION bumpes når og kun når et af felterne herunder ændres.
// Enhver sync-kørsel logger den kontraktversion den kørte under
// (conversion_sync_runs.contract_version), og enhver deal-række gemmer den
// kontraktversion den sidst blev klassificeret under
// (conversion_deal_cohort.contract_version) — se syncEngine.ts.

export const CONTRACT_VERSION = 1;

/** Unique Travels HubSpot deal-pipeline. Live-bekræftet, Gate A §3.1. */
export const HUBSPOT_PIPELINE_ID = "754595640";

/** "Tilbud sendt" — kvalifikationstærsklen for tilbudskohorten. Gate A §3.1. */
export const STAGE_QUOTE_SENT = "1098732868";

/**
 * "Opdateret tilbud" — starter ALDRIG en ny kohorte og nulstiller ALDRIG
 * first_qualified_observation_at. Kun relevant for at KENDE stagen (så den
 * ikke fejlagtigt kan tolkes som en tilbagevenden til "før tilbud"), ikke
 * for selve kvalifikationslogikken, som er historik-baseret (se classify.ts).
 */
export const STAGE_UPDATED_QUOTE = "1169407502";

/** TravelWire-bookingnummer-property. Semantik live-bekræftet, Gate A §3.1. */
export const BOOKING_NUMBER_PROPERTY = "unique_travel_bookingno";

/**
 * UT's eget salgs-status-felt. Værdier der tæller som "Booket" — bevidst
 * IKKE dealstage-id, for at undgå to potentielt modstridende udfaldskilder
 * (samme designvalg som Marketing Dashboard-projektets `classifyOutcome`,
 * genbrugt her som kontrakt, Gate A §3.1).
 */
export const DEAL_STATUS_PROPERTY = "unique_travel_dealstatus";
export const BOOKED_DEAL_STATUS_VALUES: readonly string[] = ["Solgt", "Billetter sendt"];

/** HubSpots egne tekniske lukke-flag — bruges KUN sammen med DEAL_STATUS_PROPERTY. */
export const HUBSPOT_CLOSED_PROPERTY = "hs_is_closed";
export const HUBSPOT_CLOSED_WON_PROPERTY = "hs_is_closed_won";

/** Bookingnummer-format: rene cifre-strenge (Analytics Bridge-kontrakten, samme normalisering). */
export const BOOKING_NUMBER_FORMAT_RE = /^\d+$/;

/** Konverterings-modningsvinduer (dage) — Gate B's brugerresultat, item 3. */
export const MATURITY_WINDOWS_DAYS = [30, 60, 90] as const;
export type MaturityWindowDays = (typeof MATURITY_WINDOWS_DAYS)[number];

/** Small-cell-privacy-tærskel — Gate B's adminvisning, item "celler under 10 undertrykkes". */
export const SMALL_CELL_THRESHOLD = 10;
