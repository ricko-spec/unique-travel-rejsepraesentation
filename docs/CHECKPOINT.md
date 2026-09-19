# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-19

## Branch / HEAD

- **Fase 3:** PR [#74](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/74) —
  `feat/contact-intent-73` @ `f0333312b1308c73bbfd081126a8910cb2d315e1` (Vercel preview READY på denne HEAD).
  Åben, ikke merget, 0 commits bag `main`.
- **Docs (denne branch):** `docs/working-mode-and-fase4-plan` — arbejdsform, checkpoint og Fase 4-beslutningsgrundlag.
  Docs-only; ingen kode.

## Færdigt

- Fase 3 (kontakt-intent) implementeret; ChatGPT-review og re-review gennemført (to blockers rettet).
- **Migration 012 kørt i production** (`20260919074341_trip_contact_intent`) og read-only verificeret;
  `schema-baseline.json` opdateret efter live-kørslen (kun 012-objekter); drift = "Ingen drift".
- Lokal end-to-end kontrol af den byggede app (route-adapter, kundeside, ingen skrivninger): 21/21.
- Arbejdsform dokumenteret (`docs/WORKING_MODE.md`); Fase 4-beslutningsgrundlag skrevet
  (`docs/VISION-3.0-PHASE-4-PLAN.md`).

## Udestående

1. **ChatGPT final HEAD-review** af PR #74.
2. **Rickos beslutning** om metode for `CONTACT_INTENT_TRACKING_SINCE` (A: før merge med margin / B: efter deploy —
   B anbefalet) og **eksplicit merge-godkendelse** af PR #74. *(Ricko)*
3. Efter merge/deploy: **fastlæg `CONTACT_INTENT_TRACKING_SINCE`** (eneste resterende releasetrin) og
   production-smoketest når Ricko har mulighed (kan udskydes; blokerer ikke merge).
4. **Fase 4:** afventer Rickos scopegodkendelse af planen (4 beslutninger i planens §14). Ikke påbegyndt.
5. Separat opfølgning (uden detaljer i det offentlige repo): eksisterende sikkerhedsadvarsler uden for Fase 3.

## Teststatus (PR #74, HEAD f033331)

`npm test` 604 passed (32 filer) · `npm run typecheck` grøn · `npm run lint` 0 fejl (2 kendte `<img>`-advarsler) ·
`npm run build` success · `git diff --check` ren · `node scripts/check-schema-drift.mjs` "Ingen drift".
Migration 012 lokalt (pglite): 45/45.

## Næste handling

Få ChatGPT's final HEAD-review af PR #74 og Rickos beslutninger (pkt. 2 ovenfor). Implementér **ikke** Fase 4 før
scopegodkendelse.
