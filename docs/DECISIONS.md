# DECISIONS — beslutningslog

Verificerede, gældende beslutninger. Nye beslutninger tilføjes øverst med dato.
Format: beslutning · begrundelse · kilde/commit.

| Dato | Beslutning | Begrundelse | Reference |
|---|---|---|---|
| 2026-09-17 | **Vision 3.0 Fase 1B: Model B (cookie-fri, server-side rolling visit-aggregation) er VALGT** — ikke længere kun anbefalet. Ingen ny analytics-cookie, ingen `trip_session_<slug>`, ingen persistent kunde-/sessionidentifikator, ingen middleware-udvidelse til kundesider. Et besøg er en sammenhængende læseperiode **pr. rejseplan** (ikke pr. person/enhed), afgrænset af 30 min. inaktivitet. Diskret transparens-info på `AccessGate` — ikke et consent-banner. Retention: 12 måneder efter `last_opened_at`; håndhævelsesmekanismen (`pg_cron`) er versioneret men IKKE aktiveret, kræver særskilt godkendelse | Issue #63/PR #64 sammenlignede modellerne konkret og fandt at cookie-modellens eneste tekniske grund til at kræve middleware var selve cookie-sætningen, og at den var blokeret af en uafklaret ePrivacy-vurdering Model B ikke udløser. Accepteret præcisionstab: samtidig husstandsbrug <30 min. fra hinanden tælles som ét besøg; en udlogget sælger kan få sin første åbning talt (reduceres, lukkes ikke, når admin-cookien findes) | Issue #63, PR #64, Issue #65 |
| 2026-09-15 | **Projekt-dokumentationen er strammet op** (Issue #30): `docs/STATUS.md` er kort og operationel uden PR-genfortællinger, GitHub (issues/PR'er) er backlog- og historik-sandheden, ekstern Cowork-fil er ikke længere omtalt som primær kilde | Docs var drevet fra virkeligheden og var blevet en token-kilde; agenter genlæste stale planer og gentog checks | Issue #30, denne PR |
| 2026-09-12 | **Claude Design-handoffet er source of truth for Vision 2.0's visuelle udtryk** — `docs/design/VISUAL-DETAILS.md` + `DO-NOT-CHANGE.md` er den varige designkontrakt. Egen fortolkning af faseplanen (før handoffet) viger for handoffet, hvor de er uenige | Ricko leverede et konkret designhandoff efter fase 1's første udkast; forhindrer at senere faser genimplementerer før-handoff-designet | PR #27 (`33505d2`) |
| 2026-09-10 | **Vision 2.0-faseplanen er godkendt** — `docs/VISION-2.0-PLAN.md`. Fase 1 er **Hero + rejseoverblik / førstehåndsindtryk**; galleriet flyttes til fase 4 som billedlayout-polish sammen med `next/image` | Galleriet findes allerede (hero + 3 billeder, manuelt valgte); bredde/spacing/radius/højde ændrer kundens oplevelse begrænset og er ikke en reel 2.0-start. Førstehåndsindtrykket er hvor "kunden skal visuelt forelske sig" afgøres | PR #25, `fa9c7fe` |
| 2026-09-10 | **Vision 2.0 implementeres fasevis, én PR pr. fase** — ingen samlet redesign af `/[bookingId]` i én ombæring, og intet 2.0-arbejde uden særskilt PR pr. fase | Faserne rører filer som ni tidligere PR'er har ændret; små, testbare skridt holder regressionsrisikoen nede | PR #25 |
| 2026-07-21 | **Vision 2.0 planlægges som preview-branch før merge** — intet 2.0-arbejde direkte på main | main = production; visuelt løft skal kunne testes af Ricko/sælgere isoleret | Denne branch (`docs/ai-operating-model`) |
| 2026-07-20 | **Destinationer oprettes manuelt i admin** ("Opret destination") — ingen auto-upsert fra trips endnu. Besluttet/preview-testet 2026-07-20, merged til main 2026-07-21 | Bevidst lille scope; auto-upsert (Fable DATA-4) er backlog | `6bb1498`, merge `6a81290` |
| 2026-07-20 | **Store destinationsbilleder uploades via signed URL direkte til Supabase Storage** (`_staging` + finalize), op til 50 MB; bucket-grænse hævet 10→50 MB | Vercel afviser request-bodies > 4,5 MB ved platform-kanten; klient-side resize fravalgt pga. kvalitet (sharp server-side) | `324fae0`, `234d2e8` |
| 2026-07-20 | **Password-skift kræver nuværende adgangskode** + separat rate-limit (`pwchange:{ip}`) | En kapret session må ikke lydløst kunne overtage kontoen | `ba1b5e1` |
| 2026-07-20 | **Intro-audit logger sha256-fingerprints + længder, aldrig fuld tekst** (SEC-3). Fuldt revisionsspor bor på trip-rækken (`introOriginal`, `introEditedAt/By`) | audit_log-kontrakten: "Ingen PII". Teksterne kan indeholde kundedata | `e43ff2f` |
| 2026-07-20 | **Slug må aldrig være booking-nummeret** — DB genererer tilfældig 12-hex; upsert sender aldrig slug (SEC-1) | Booking-nr er kundens adgangskode; slug = kode ville lægge koden i URL'en | `6ccfef4` |
| 2026-07-20 | **Al audit via central `src/lib/audit.ts`** med typed action-union; actor-format `admin:{email}` / `customer:{slug}` | Compiler-fangede tastefejl; ét mønster (Fable DATA-2) | `ec1dc8d` |
| 2026-07-20 | **Hele DB-skemaet versioneres som idempotente migrationer** (`001-008`) + mekanisk drift-tjek mod committet baseline | Skema-drift var sket tre gange; repo skal kunne genskabe DB'en | `30c0d11`, `b5a9f90` |
| 2026-06-15 | **Booking-nummeret er kundens unlock-kode**, beskyttet af rate-limit (10/15 min pr. IP pr. slug) + audit | Nul kundefriktion (koden står i mailen); rate-limit er den reelle beskyttelse. Separat kode er åbent spørgsmål (backlog #21, KRÆVER RICKO) | `d660f0c` |
| 2026-06-02 | **Individuelle sælger-logins via Supabase Auth** (invite-only, hard cutover fra delt kode) + `profiles`-tabel med advisor-matching | Sporbarhed pr. sælger; krav fra IT (Anders) | `e48eb8c`..`2f0bd42` |
| 2026-05-27 | **Intro-stilen er ENS for alle sælgere** — brand-politik i SYSTEM_PROMPT + bløde (aldrig blokerende) advarsler i editoren | Strategisk brand-beslutning, ikke teknisk | `584f97a`, `bf6d416` |
| 2026-05-23 | **main = production**: Vercel auto-deploy ved push; preview pr. branch; merge kun efter Rickos OK | Enkelt setup for lille team; disciplinen ligger i processen | Projektstart |
| 2026-05-23 | **Preview deler production-DB og -Storage** — intet separat miljø | Bevidst enkelthed; konsekvens: test-data er ægte data (se AGENTS.md) | Projektstart |
| 2026-05-23 | **Service-role-nøglen kun server-side** (`src/lib/supabase/server.ts`, valideres ved opstart); RLS lukker al direkte klient-adgang | Public repo + klient-sikkerhed | Projektstart |

## Åbne beslutninger (KRÆVER RICKO)

- **Unlock-kode ≠ booking_no?** (backlog #21) — UX-friktion vs. risiko ved videresendt link+kode
- **Slug-override-feltet i admin** — har aldrig virket (serveren ignorerer det); fjern eller gør funktionelt
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop
