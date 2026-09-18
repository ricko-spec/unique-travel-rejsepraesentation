// Vision 3.0 Fase 1B/2/3 (Issue #65/#71/#73) — diskret transparens-tekst om
// hvad der registreres på kundesiden. ÉN delt konstant, så AccessGate (første
// besøg, før koden er indtastet) og Footer (den oplåste rejseplan — også for
// kunder med en eksisterende 30-dages adgangscookie, som aldrig ser
// AccessGate) altid viser præcis samme ordlyd.
//
// Dækker nu tre ting: at rejseplanen åbnes (Fase 1B), hvilke hovedafsnit der
// ses (Fase 2) og at kontaktmuligheder bruges (Fase 3 — email-/telefon-links).
//
// Ikke et consent-banner: ingen checkbox, ingen modal, ingen cookie.
export const TRACKING_NOTICE =
  "Vi registrerer, når rejseplanen åbnes, hvilke hovedafsnit der ses, og når kontaktmuligheder bruges, så din rejserådgiver bedre kan følge op på tilbuddet.";
