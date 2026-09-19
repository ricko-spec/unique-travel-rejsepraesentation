# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-19 (efter merge af PR #74)

## Branch / HEAD

- **Production `main`:** `3e39c87083c81a77426a2c2deb67ea0e50bb45ec`. Vercel production-deployment
  (`dpl_HzNGQfgsg8iPFn8sUDRuALrPtNHd`) blev **READY 2026-09-19T08:21:19Z** og er aliaset til
  `rejseplaner.uniquetravel.dk`.
- **PR [#74](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/74) er MERGET** (2026-09-19T08:20:16Z,
  rebase-merge; `main`-træet er identisk med PR-branchens sidste HEAD `f033331`). **Fase 3 (kontakt-intent) er live.**
- **PR [#75](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/75)** — `docs/working-mode-and-fase4-plan`,
  rebaset på `3e39c87`. **Docs-only** (ingen kode, ingen migration). HEAD = seneste commit på branchen.

## Færdigt

- **Fase 3 live:** endpoint `POST /[bookingId]/intent`, tracked links (ContactCTA email + telefon, ActionBar "Ring"),
  "Kontakt-intent" i admin, opdateret transparenstekst. ChatGPT-review og re-review gennemført (to blockers rettet).
- **Migration 012 kørt i production** (`20260919074341_trip_contact_intent`) og read-only verificeret;
  `schema-baseline.json` opdateret efter live-kørslen (kun 012-objekter); drift = "Ingen drift".
- **Cutover-metode B er valgt** for `CONTACT_INTENT_TRACKING_SINCE` (sæt værdien efter production er READY; aldrig
  migrationstidspunktet).
- **Ingen syntetiske production-events blev oprettet** (hverken ved verifikation eller deploy).
- Arbejdsform (`docs/WORKING_MODE.md`) og Fase 4-beslutningsgrundlag (`docs/VISION-3.0-PHASE-4-PLAN.md`, FORSLAG)
  ligger på PR #75.

## Udestående

1. **`CONTACT_INTENT_TRACKING_SINCE` er fortsat `null`** (`src/lib/contact-intent-tracking.ts` på `main`). Den kan
   sættes til **`2026-09-19T08:21:19Z`** (production READY) i **næste relevante kodeleverance**. Det er en kodeændring og
   kræver derfor preview → review → Rickos merge-OK som al push til `main`. Vagt-testene accepterer værdien (den er
   senere end både migrationstidspunktet `2026-09-19T07:43:41Z` og Fase 1B's `TRACKING_SINCE`). Indtil da viser admin den
   ærlige, dato-løse tekst: "Kontaktklik registreres fra det tidspunkt funktionen sættes i drift."
2. **Production-smoketest** af Fase 3 (og den udsatte UI-smoketest af Fase 1C/2) når Ricko har mulighed. Må ikke oprette
   kunstige events. Blokerer ikke andet arbejde.
3. **Fase 4 afventer Rickos scopegodkendelse** af planen (fire beslutninger i planens §14). **Ikke påbegyndt.**
4. **Merge af PR #75** kræver Rickos eksplicitte godkendelse (main = production).
5. Separat opfølgning (uden detaljer i det offentlige repo): eksisterende sikkerhedsadvarsler uden for Fase 3.

## Teststatus

- **Fase 3-koden på `main`** (identisk med PR #74-HEAD `f033331`): `npm test` 604 passed (32 filer) · `npm run typecheck`
  grøn · `npm run lint` 0 fejl (2 kendte `<img>`-advarsler) · `npm run build` success · `git diff --check` ren ·
  `node scripts/check-schema-drift.mjs` "Ingen drift". Migration 012 lokalt (pglite): 45/45. Lokal end-to-end kontrol af
  den byggede app: 21/21. Ingen kodeændringer siden.
- **PR #75:** docs-only ⇒ `git diff --check` ren; ingen kode-filer i diffen.

## Næste handling

Få Rickos beslutninger: scopegodkendelse af Fase 4 (planens §14) og hvornår konstanten sættes (`2026-09-19T08:21:19Z` i
næste kodeleverance). Implementér **ikke** Fase 4 før scopegodkendelse.
