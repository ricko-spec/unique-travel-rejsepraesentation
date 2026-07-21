# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-07-21** (efter kit-mergen)

## Production

- **Commit:** `fcadaca` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk/admin` svarer HTTP 200
- Indhold: juli-batchen (sec-fixes, password-flow, destinations-upload m. WebP, opret-destination)
  + **AI Project Automation Kit i drift** (AGENTS.md, CLAUDE.md, docs-sættet — merged 2026-07-21)

## Branches

| Branch | Tilstand |
|---|---|
| `main` | = origin/main = `fcadaca` (production) |
| `docs/ai-operating-model` | Merged til main — kan slettes (KRÆVER RICKO) |
| `docs/status-after-kit-merge` | Denne opdatering — slettes efter merge |
| `feature/individuelle-logins-profiles` | Desktop-checkout, rent, alt merged — kan slettes (KRÆVER RICKO) |
| `dest-admin` (+ ældre remote-branches) | Merged — sletning afventer OK |

## Åbne tråde

1. Mille: opret Japan/Kenya/Mauritius + billeder i production (ren drift, ingen kode)
2. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt
3. `stash@{0}` "image-library WIP" — fredet, beslutning udestår
4. Branch-oprydning af gamle merged branches — afventer Rickos OK

## Seneste checks (2026-07-21, main-baseret)

typecheck ✅ · lint ✅ (0 fejl; 4 kendte img-warnings = PERF-3) · build ✅ (2026-07-20, rent worktree) ·
schema-drift ✅ "Ingen drift" · DB sund (35 trips, 13 destinationer, 0 staging-rester, audit-flows aktive)

## Kendte risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data
- **Ingen automatiske tests** (TEST-1) — regressioner fanges kun af typecheck/lint/manuel test
- **Storage-bucket-config uden for drift-tjekket** (destinations: 50 MB + MIME-allowlist)
- Parse-routen har latent 4,5 MB-grænse på PDF'er (Vercel-body-limit; TravelWire-PDF'er er små i praksis)
- Repo er public — disciplin omkring secrets/kundedata er procesbåret, ikke teknisk håndhævet

## Næste anbefalede outcome

1. **Mille opretter Japan/Kenya/Mauritius + uploader billeder i production** (Admin →
   Destinationsbilleder → Opret destination) — ren drift, ingen kode
2. **Vision 2.0 scope-afklaring og plan** med Ricko — ingen kode endnu (jf. beslutning:
   planlægges som preview-branch før merge)
