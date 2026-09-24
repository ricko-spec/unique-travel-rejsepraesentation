// Vision 3.0 Fase 5, Gate B (Issue #80) — versioneret pipeline-/stage-/felt-
// kontrakt. Bindende fakta fra Gate A (Issue #78, PR #79), gentages IKKE som
// ny beslutning her — kun kodet som konstanter, så en fremtidig ændring i
// HubSpot (nyt stage-id, ny pipeline) bliver en eksplicit, versioneret
// kontraktdrift-hændelse (fail-closed sync), ikke en stille fejlklassifikation.
//
// CONTRACT_VERSION bumpes når og kun når et af felterne herunder ændres.
// conversion_measurement_state.contract_version SKAL være lig denne værdi —
// ellers afviser både sync-motoren og commit-RPC'en kørslen
// (CONTRACT_VERSION_MISMATCH). Enhver deal-række og sync-kørsel gemmer den
// kontraktversion den blev skrevet under.
//
// v2 (PR #81 review-runde 1): kvalifikation er et AKTUELT snapshot af dealens
// stage (ingen historisk dealstage-rekonstruktion — Gate A: UNUSABLE), og
// udfaldet følger den eksplicitte sandhedstabel i `classifyOutcomeSignal`.

export const CONTRACT_VERSION = 2;

/** Unique Travels HubSpot deal-pipeline. Live-bekræftet, Gate A §3.1. */
export const HUBSPOT_PIPELINE_ID = "754595640";

/** "Tilbud sendt" — kvalifikationstærsklen for tilbudskohorten. Gate A §3.1. */
export const STAGE_QUOTE_SENT = "1098732868";

/**
 * "Opdateret tilbud" — er kvalificeret (tilbud ER sendt), men starter ALDRIG
 * en ny kohorte: en deal der allerede er ENROLLED har frosset kohortestart og
 * eksponering, og en deal der første gang ses her, optages med den aktuelle
 * observation som start — præcis som "Tilbud sendt". Gate A §3.1/§5.
 */
export const STAGE_UPDATED_QUOTE = "1169407502";

/**
 * Hvordan en AKTUEL dealstage i pipelinen fortolkes. Afgøres udelukkende af
 * dealens stage på observationstidspunktet — aldrig af historik.
 *
 *  - PRE_QUOTE:        åben, tilbud endnu ikke sendt (fx Screened). Må ikke
 *                      være lukket (hs_is_closed=true ⇒ kontraktdrift).
 *  - QUOTE_OR_LATER:   "Tilbud sendt eller senere" — dealen HAR fået tilbud.
 *                      Må være åben eller lukket (fx en solgt-stage).
 *  - CLOSED_AMBIGUOUS: lukket stage der kan nås både før og efter et tilbud
 *                      (typisk tabt/afvist). En deal der FØRSTE gang ses her
 *                      efter baseline, kan ikke afgøres entydigt og udelukkes
 *                      med CLOSED_BEFORE_QUALIFIED_OBSERVATION (aldrig
 *                      stiltiende optaget eller PDF_ONLY). Skal være lukket.
 */
export type StageClass = "PRE_QUOTE" | "QUOTE_OR_LATER" | "CLOSED_AMBIGUOUS";

export type PipelineStageContract = {
  pipelineId: string;
  /**
   * `true` først når HVER live-stage i pipelinen er klassificeret herunder og
   * bekræftet af Ricko ved Gate C (live-metadata må ikke læses i Gate B).
   * `false` ⇒ enhver ikke-dry-run sync fejler lukket med CONTRACT_INCOMPLETE.
   */
  complete: boolean;
  stages: Readonly<Record<string, StageClass>>;
};

/**
 * Den eneste kilde til "Tilbud sendt eller senere". Kun de to stages Gate A
 * har live-bekræftet er udfyldt. De øvrige stage-id'er i pipelinen (Screened,
 * solgt, tabt/afvist m.fl.) er IKKE kendt i repoet — Gate A brugte historik
 * og havde derfor ikke brug for dem. De skal tilføjes her fra live-metadata
 * ved Gate C (med CONTRACT_VERSION-bump), og `complete` sættes til `true`
 * først da. Indtil da kan ingen officiel sync gennemføres — bevidst fail-closed.
 */
export const PIPELINE_STAGE_CONTRACT: PipelineStageContract = {
  pipelineId: HUBSPOT_PIPELINE_ID,
  complete: false,
  stages: {
    [STAGE_QUOTE_SENT]: "QUOTE_OR_LATER",
    [STAGE_UPDATED_QUOTE]: "QUOTE_OR_LATER",
  },
};

/** TravelWire-bookingnummer-property. Semantik live-bekræftet, Gate A §3.1. */
export const BOOKING_NUMBER_PROPERTY = "unique_travel_bookingno";

/**
 * UT's eget salgs-status-felt — den ENESTE kilde til "Booket" (Gate A §3.1/§5:
 * "kun overgangen til det UT-ejede solgt/booket-signal tæller som Booket",
 * bevidst IKKE dealstage og derfor heller ikke `hs_is_closed_won`, som HubSpot
 * afleder af dealstage).
 */
export const DEAL_STATUS_PROPERTY = "unique_travel_dealstatus";
export const BOOKED_DEAL_STATUS_VALUES: readonly string[] = ["Solgt", "Billetter sendt"];

/** HubSpots egne tekniske lukke-flag — bruges KUN til datakvalitet (tabt/konflikt), aldrig til Booket. */
export const HUBSPOT_CLOSED_PROPERTY = "hs_is_closed";
export const HUBSPOT_CLOSED_WON_PROPERTY = "hs_is_closed_won";

export type OutcomeSignal =
  | { kind: "valid"; booked: boolean; lostObserved: boolean; conflict: boolean }
  | { kind: "contract-drift" };

/**
 * Sandhedstabellen for udfald (én definition — migrationen, runbook og ADR
 * henviser hertil):
 *
 * | dealstatus i BOOKED_DEAL_STATUS_VALUES | hs_is_closed | hs_is_closed_won | Resultat                                    |
 * |----------------------------------------|--------------|------------------|---------------------------------------------|
 * | ja                                     | true         | true             | BOOKED                                      |
 * | ja                                     | false        | false            | BOOKED (UT-status er autoritativ)           |
 * | ja                                     | true         | false            | BOOKED + outcome-konflikt (datakvalitet)    |
 * | nej                                    | false        | false            | NOT_BOOKED (åben)                           |
 * | nej                                    | true         | false            | NOT_BOOKED + tabt/afvist (datakvalitet)     |
 * | nej                                    | true         | true             | NOT_BOOKED + outcome-konflikt (datakvalitet)|
 * | —                                      | false        | true             | umulig kombination ⇒ kontraktdrift (sync fejler lukket) |
 *
 * Tabt/afvist og konflikter indgår ALDRIG i konverteringsprocenten; de vises
 * kun som (small-cell-beskyttet) datakvalitet.
 */
export function classifyOutcomeSignal(input: {
  dealStatusRaw: string | null;
  hubspotClosed: boolean;
  hubspotClosedWon: boolean;
}): OutcomeSignal {
  if (input.hubspotClosedWon && !input.hubspotClosed) return { kind: "contract-drift" };
  const sold = input.dealStatusRaw !== null && BOOKED_DEAL_STATUS_VALUES.includes(input.dealStatusRaw.trim());
  if (sold) {
    return { kind: "valid", booked: true, lostObserved: false, conflict: input.hubspotClosed && !input.hubspotClosedWon };
  }
  return {
    kind: "valid",
    booked: false,
    lostObserved: input.hubspotClosed && !input.hubspotClosedWon,
    conflict: input.hubspotClosed && input.hubspotClosedWon,
  };
}

/** Bookingnummer-format: rene cifre-strenge (Analytics Bridge-kontrakten, samme normalisering). */
export const BOOKING_NUMBER_FORMAT_RE = /^\d+$/;

/** Konverterings-modningsvinduer (dage) — Gate B's brugerresultat, item 3. */
export const MATURITY_WINDOWS_DAYS = [30, 60, 90] as const;
export type MaturityWindowDays = (typeof MATURITY_WINDOWS_DAYS)[number];

/** Small-cell-privacy-tærskel — Gate B's adminvisning, item "celler under 10 undertrykkes". */
export const SMALL_CELL_THRESHOLD = 10;

/** Mindste længde på HMAC-secrets (openssl rand -hex 32 ⇒ 64 tegn). Kortere/tomme afvises før enhver læsning. */
export const MIN_SECRET_LENGTH = 32;

/** Seneste succesfulde sync ældre end dette ⇒ adminvisningen markerer data som forældet. */
export const STALE_AFTER_HOURS = 36;

/** Lease for en RUNNING sync-kørsel. Ældre RUNNING-rækker markeres ABANDONED af næste begin. */
export const SYNC_LEASE_SECONDS = 1800;
