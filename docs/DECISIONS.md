# DECISIONS — beslutningslog

Verificerede, gældende beslutninger. Nye beslutninger tilføjes øverst med dato.
Format: beslutning · begrundelse · kilde/commit.

| Dato | Beslutning | Begrundelse | Reference |
|---|---|---|---|
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

- **Vision 2.0 scope og indhold** — kun hensigt kendt (visuelt løft, galleri); ingen plan endnu
- **Unlock-kode ≠ booking_no?** (backlog #21) — UX-friktion vs. risiko ved videresendt link+kode
- **Slug-override-feltet i admin** — har aldrig virket (serveren ignorerer det); fjern eller gør funktionelt
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop
- **Sletning af gamle branches** (`dest-admin`, `feature/individuelle-logins-profiles`, `feature/redigerbar-intro`, `gallery-upload-diagnose`) — alt er merged, men sletning afventer OK
