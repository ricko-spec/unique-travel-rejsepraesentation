# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-07-22** (efter Sebastian-bugfix-mergen)

## Production

- **Commit:** `cc06d1a` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk/admin` svarer HTTP 200
- Indhold: kit-mergen + **Sebastian-bugfixes (PR #1, merged 2026-07-22 efter Rickos OK):**
  merpris/besparelse-etiket bestemmes nu af savings-strengen, danske datoer i hero-pillen,
  "sub-hoteller" vises som "hoteller undervejs", display-helpers samlet i `src/lib/format.ts`
- Alle tre rettelser verificeret live på booking 35385 efter deploy

## Branches

| Branch | Tilstand |
|---|---|
| `main` | = origin/main = `cc06d1a` (production) |
| `fix/customer-trip-display-issues` | Merged til main (PR #1) — kan slettes (KRÆVER RICKO) |
| `docs/status-after-sebastian-fixes` | Denne opdatering — slettes efter merge |
| `docs/ai-operating-model` | Merged til main — kan slettes (KRÆVER RICKO) |
| `feature/individuelle-logins-profiles` | Desktop-checkout er skiftet til main; branchen er ren, alt merged — kan slettes (KRÆVER RICKO) |
| `dest-admin` (+ ældre remote-branches) | Merged — sletning afventer OK |

## Åbne tråde

1. **Rundrejse-/turprogram-nætter i top-summary (Bug 3 fra Sebastians test):** bevidst IKKE løst —
   separat produkt-/designopgave jf. Rickos beslutning 2026-07-22. Top-summary er parser-genereret
   `subtitle`-fritekst; data findes sikkert i `hotels[].nights` + `isPackage`. KRÆVER RICKO (scope)
2. Evt. parser-prompt-præcisering så `savings` altid begynder med "Merpris"/"Besparelse" —
   valgfri hærdning, KRÆVER RICKO
3. Mille: opret Japan/Kenya/Mauritius + billeder i production (ren drift, ingen kode)
4. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt
5. `stash@{0}` "image-library WIP" — fredet, beslutning udestår
6. Branch-oprydning af gamle merged branches — afventer Rickos OK

## Seneste checks (2026-07-22, `cc06d1a`)

typecheck ✅ · lint ✅ (0 fejl; 4 kendte img-warnings = PERF-3) · build ✅ ·
**unit-tests ✅ 10/10 (vitest — projektets første automatiske tests, `npm test`)** ·
schema-drift ikke kørt (intet DB-arbejde i denne runde) · production-verifikation ✅ (35385, 34504, 35184)

## Kendte risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data
- **Automatiske tests dækker nu kun display-helpers i `src/lib/format.ts`** (TEST-1 kun delvist
  lukket) — øvrige regressioner fanges stadig kun af typecheck/lint/manuel test
- Merpris-heuristikken (`+`-præfiks) bygger på de 7 kendte savings-strenge i production —
  fremtidige parses med andet format kan kræve justering (jf. åben tråd 2)
- **Storage-bucket-config uden for drift-tjekket** (destinations: 50 MB + MIME-allowlist)
- Parse-routen har latent 4,5 MB-grænse på PDF'er (Vercel-body-limit; TravelWire-PDF'er er små i praksis)
- Repo er public — disciplin omkring secrets/kundedata er procesbåret, ikke teknisk håndhævet

## Næste anbefalede outcome

1. **Sebastian gentester booking 35385 på production** (merpris-linje, hero-datoer, "hoteller undervejs")
2. **Mille opretter Japan/Kenya/Mauritius + uploader billeder i production** — ren drift, ingen kode
3. **Bug 3-scope (rundrejse-nætter) og Vision 2.0 afklares med Ricko** — ingen kode endnu
