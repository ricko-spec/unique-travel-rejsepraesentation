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
// v3 (Gate C1, Issue #84): komplet stagekontrakt for alle 18 live-stages med
// forventet lukke-flag; nye klasser OUTCOME_WITHOUT_QUOTE_EVIDENCE og
// CLOSED_NO_QUOTE. Production-DB'ens default er bevidst stadig 2, så enhver
// non-dry-run fejler lukket (CONTRACT_VERSION_MISMATCH) indtil en senere,
// separat reviewet aktiveringsgate løfter versionen.

export const CONTRACT_VERSION = 3;

/** Unique Travels HubSpot deal-pipeline. Live-bekræftet, Gate A §3.1 og Gate C1. */
export const HUBSPOT_PIPELINE_ID = "754595640";

/** "Tilbud sendt" — første kvalificerende punkt for tilbudskohorten. */
export const STAGE_QUOTE_SENT = "1098732868";

/**
 * "Opdateret tilbud" — tilbud eller senere; starter ALDRIG en ny kohorte og
 * nulstiller ALDRIG kohortestart eller eksponering (terminal tilstand i
 * reduceren + DB-trigger).
 */
export const STAGE_UPDATED_QUOTE = "1169407502";

/**
 * Hvordan en AKTUEL dealstage fortolkes (v3, Gate C1). Afgøres udelukkende af
 * dealens stage på observationstidspunktet — aldrig af historik.
 *
 *  - PRE_QUOTE: åben; tilbud endnu ikke sendt. Deal forbliver ELIGIBLE_PENDING.
 *  - QUOTE_OR_LATER: "Tilbud sendt"/"Opdateret tilbud". Første prospektive
 *    observation her optager dealen (kohortestart = observationen).
 *  - OUTCOME_WITHOUT_QUOTE_EVIDENCE: en senere fase eller et udfald (solgt,
 *    billetter, afslag, aflyst, på rejse, hjemvendt) — åben ELLER lukket — der
 *    IKKE beviser, at "Tilbud sendt" er observeret. En ny eller pending deal,
 *    der første gang ses her, udelukkes (EXCLUDED/
 *    CLOSED_BEFORE_QUALIFIED_OBSERVATION) og optages aldrig. (Erstatter v2's
 *    CLOSED_AMBIGUOUS, som kun kunne udtrykke lukkede stages.)
 *  - CLOSED_NO_QUOTE: lukket UDEN tilbud (Screenet, Dubletter, Test Leads). Ved
 *    baseline PRE_START_EXISTING; derefter ELIGIBLE_PENDING — optages aldrig på
 *    denne stage alene, kun hvis dealen senere observeres i QUOTE_OR_LATER.
 */
export type StageClass = "PRE_QUOTE" | "QUOTE_OR_LATER" | "OUTCOME_WITHOUT_QUOTE_EVIDENCE" | "CLOSED_NO_QUOTE";

/** Én stage i kontrakten: klasse + det forventede lukke-flag (= live metadata.isClosed). */
export type StageContractEntry = { class: StageClass; closed: boolean; label: string };

export type PipelineStageContract = {
  pipelineId: string;
  /** `true` når HVER live-stage er klassificeret. `false` ⇒ enhver sync fejler lukket (CONTRACT_INCOMPLETE). */
  complete: boolean;
  stages: Readonly<Record<string, StageContractEntry>>;
};

/**
 * v3: komplet klassifikation af alle 18 live-stages i pipeline 754595640
 * (read-only metadata hentet af Ricko 2026-09-25, Issue #84). `closed` er
 * stagens metadata.isClosed; hver deals hs_is_closed skal matche den, og den
 * live stage-liste (id + closed) skal matche kontrakten 1:1 — ellers
 * kontraktdrift. Vurderingen pr. stage er dokumenteret i
 * docs/VISION-3.0-PHASE-5-GATE-C1.md.
 */
export const PIPELINE_STAGE_CONTRACT: PipelineStageContract = {
  pipelineId: HUBSPOT_PIPELINE_ID,
  complete: true,
  stages: {
    "1098732865": { class: "PRE_QUOTE", closed: false, label: "Lead (Aktive)" },
    "1098732866": { class: "PRE_QUOTE", closed: false, label: "Assigned" },
    "1169086048": { class: "PRE_QUOTE", closed: false, label: "Forsøgt kontaktet (1)" },
    "1400145244": { class: "PRE_QUOTE", closed: false, label: "Forsøgt kontaktet (2)" },
    "1110279228": { class: "PRE_QUOTE", closed: false, label: "Følg op" },
    "1098732867": { class: "PRE_QUOTE", closed: false, label: "Lav tilbud" },
    [STAGE_QUOTE_SENT]: { class: "QUOTE_OR_LATER", closed: false, label: "Tilbud sendt" },
    [STAGE_UPDATED_QUOTE]: { class: "QUOTE_OR_LATER", closed: false, label: "Opdateret tilbud" },
    "1098732870": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "Solgt" },
    "1419023367": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "Solgt (I andet bookingnr.)" },
    "1407668785": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "Billetter sendt" },
    "1354831680": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "Afslag (Alle)" },
    "1386314544": { class: "CLOSED_NO_QUOTE", closed: true, label: "Screenet" },
    "1110279229": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: false, label: "På rejse" },
    "1110279231": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: false, label: "Hjemvendt" },
    "1110279230": { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "Aflyst rejse (Alle)" },
    "1110279232": { class: "CLOSED_NO_QUOTE", closed: true, label: "Dubletter" },
    "1110279233": { class: "CLOSED_NO_QUOTE", closed: true, label: "Test Leads" },
  },
};

/** Intern konsistens: PRE_QUOTE skal være åben, CLOSED_NO_QUOTE lukket, mindst én QUOTE_OR_LATER. */
export function stageContractViolation(c: PipelineStageContract): string | null {
  const entries = Object.values(c.stages);
  for (const e of entries) {
    if (e.class === "PRE_QUOTE" && e.closed) return "pre_quote_must_be_open";
    if (e.class === "CLOSED_NO_QUOTE" && !e.closed) return "closed_no_quote_must_be_closed";
  }
  if (c.complete && !entries.some((e) => e.class === "QUOTE_OR_LATER")) return "no_qualifying_stage";
  return null;
}

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
