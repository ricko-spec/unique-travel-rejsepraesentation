# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-07-21** (kit-dokumentationsbatchen)

## Production

- **Commit:** `6a81290` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk/admin` svarer HTTP 200
- Indhold: hele juli-batchen (sec-fixes, password-flow, destinations-upload m. WebP, opret-destination, docs)

## Branches

| Branch | Tilstand |
|---|---|
| `main` | = origin/main = `6a81290` (production) |
| `docs/ai-operating-model` | **Aktiv** — kit-dokumentationen (denne batch); afventer ChatGPT-review + Rickos merge-OK |
| `feature/individuelle-logins-profiles` | Desktop-checkout, rent, alt merged — kan slettes (KRÆVER RICKO) |
| `dest-admin` (+ ældre remote-branches) | Merged — sletning afventer OK |

## Åbne tråde

1. Kit-dokumentationen: review → merge-OK
2. Mille: opret Japan/Kenya/Mauritius + billeder i production (ren drift)
3. `stash@{0}` "image-library WIP" — fredet, beslutning udestår
4. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt

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

Få kit-dokumentationen godkendt og merget → derefter roadmap "Næste" pkt. 2-3
(Mille-drift og Vision 2.0-scopeafklaring).
