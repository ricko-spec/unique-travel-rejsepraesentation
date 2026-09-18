// Vision 3.0 Fase 1B/2 (Issue #65/#71) — diskret transparens-tekst om hvad
// der registreres på kundesiden. ÉN delt konstant, så AccessGate (første
// besøg, før koden er indtastet) og Footer (den oplåste rejseplan — også for
// kunder med en eksisterende 30-dages adgangscookie, som aldrig ser
// AccessGate) altid viser præcis samme ordlyd.
//
// Ikke et consent-banner: ingen checkbox, ingen modal, ingen cookie.
export const TRACKING_NOTICE =
  "Vi registrerer, når rejseplanen åbnes, og hvilke hovedafsnit der ses, så din rejserådgiver bedre kan følge op på tilbuddet.";
