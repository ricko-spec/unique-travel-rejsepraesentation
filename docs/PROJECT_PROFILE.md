# PROJECT_PROFILE — Unique Travel Rejsepræsentation

> Step 1 i AI Project Automation Kit. Udfyldt 2026-07-21 ved ren verifikation af repo,
> live-database og produktions-deploy — ingen ændringer foretaget under kortlægningen.
> Ved uoverensstemmelse mellem denne profil og koden: koden vinder — opdatér profilen.

## Identitet

- **Projekt:** Intern Next.js 14-webapp: TravelWire-PDF → Claude-parsing → kode-låst kundepræsentation
- **Lokal sti:** `C:\Users\tilde\Desktop\uniquetravel-rejsepraesentation`
- **Repo:** `ricko-spec/unique-travel-rejsepraesentation` (GitHub, PUBLIC — ingen secrets eller kundedata i repo)
- **Default branch:** `main` · **Produktion:** Vercel auto-deploy ved push til main → `rejseplaner.uniquetravel.dk`
- **Backend:** Supabase `iunixfpthdftmkgpugex` (Postgres 17, eu-west-1) — data, auth, storage.
  **Deles af preview OG produktion** — test-data i preview er ægte data.
- **Brugere:** Unique Travels sælgere (7 profiler) + Mille (destinationsbilleder). Kunder ser kode-låste præsentationer.

## Git-tilstand (VERIFICERET 2026-07-21)

- `main` = `origin/main` = **`6a81290`** — synkron. Produktions-deploy for præcis denne commit er **READY**
  (verificeret via Vercel-API + `GET /admin` → HTTP 200 på produktionsdomænet).
- `dest-admin` er **merged til main** (fast-forward `234d2e8..6a81290`, 2026-07-21): opret-destination-UI,
  rettet hjælpetekst og ajourført SYSTEM-ARKITEKTUR.md. `origin/dest-admin` er ikke længere en åben tråd —
  branchen kan slettes ved lejlighed (ikke gjort endnu).
- Desktop-checkoutet står på `feature/individuelle-logins-profiles` @ `ba1b5e1` — rent, alt indhold er i main
  (minus webp-batchen som main har). Branchen kan slettes/genbruges.
- **Stash:** `stash@{0}` "image-library WIP" (juni 2026) — SKAL bevares indtil Ricko beslutter:
  genoptag, flyt til branch, eller drop. Forsvinder hvis stashen ryddes.
- Åbne PRs: 0 · Åbne issues: 0 · Ældre remote-branches (`feature/redigerbar-intro`,
  `gallery-upload-diagnose`, `feature/individuelle-logins-profiles`, `dest-admin`) er bevaret.

## Toolchain

- **Package manager:** npm (`package-lock.json`; ingen yarn/pnpm)
- **Scripts:** `dev` / `build` / `start` / `lint` / `typecheck` — INTET test-script (ingen tests i projektet, TEST-1-backlog)
- **Checks (seneste kørsler):** typecheck ✅ · lint ✅ (0 fejl; 4 kendte `no-img-element`-warnings = PERF-3-backlog) ·
  `node scripts/check-schema-drift.mjs` ✅ "Ingen drift" (2026-07-21) · build ✅ (2026-07-20 på main i rent worktree)
- **OBS:** `sharp` er dependency på main — checkouts uden frisk `npm install` mangler den i `node_modules`.
  Kør altid `npm install`/`npm ci` før lokal kørsel.
- **Claude Code CLI** v2.1.215 installeret og arbejder i mappen. `dispatch`-kommando IKKE fundet på PATH (status ukendt).
- **Arbejdskonvention:** alt agent-arbejde foregår i git worktrees under scratchpad — Desktop-checkoutet røres ikke.

## Miljøvariabler (navne — værdier ligger KUN i `.env.local` og Vercel project settings)

`ANTHROPIC_API_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`

Lokalt: `.env.local` findes (gitignored). Service-role-nøglen valideres kryptografisk ved opstart
(`src/lib/supabase/server.ts`) og må aldrig forlade server-side kode.

## Dokumentation

- `docs/SYSTEM-ARKITEKTUR.md` — komplet systembeskrivelse, **ajourført på main pr. 2026-07-21**
  (dækker sec-batch, password-flow, destinations-upload-flowet, opret-destination og alle 11 API-routes)
- `supabase/README.md` + migrationer `001-008_*.sql` (idempotente, verificeret = live-DDL) +
  `schema-baseline.json` (grundlag for drift-tjekket)
- `README.md` (setup) · `docs/PROJECT_PROFILE.md` (denne fil)
- INGEN projekt-`CLAUDE.md`/`AGENTS.md` endnu — planlagt som del af AI Project Automation Kit
- Ekstern kontekst (udenfor repo): `Documents\Claude\Projects\Brandfarver og præsentationsside-design\`
  — `OPGAVER-TIL-CLAUDE-CODE.md` (prioriteret backlog fra Fable-review), handoff-filer, brand-pakke

## Husregler (praksis der skal med i en kommende projekt-CLAUDE.md)

1. **Push til main = produktionsudgivelse.** Preview-test + Rickos eksplicitte OK FØR merge. Fast-forward foretrækkes.
2. Preview-deploys ligger bag Vercel Authentication og deler produktions-DB/-Storage.
3. Service-role-nøglen kun i `src/lib/supabase/server.ts`. Intro-ændringer kun via intro-endpointet.
   Intro-stilen differentieres aldrig pr. sælger (brand-beslutning).
4. **Ny DDL = ny nummereret migrationsfil (009+) + `node scripts/check-schema-drift.mjs --update-baseline`
   i samme ombæring.** Storage-bucket-config er drift-tjekkets kendte blinde vinkel
   (`destinations`: 50 MB file_size_limit + MIME-allowlist, ligger i `storage`-skemaet).
5. Vercel serverless afviser request-bodies > 4,5 MB — filer uploades direkte til Supabase Storage
   via signed URLs (se destinations-flowet). Parse-routen (PDF via FormData) har samme latente grænse.
6. Audit via central `src/lib/audit.ts` (typed actions, best-effort). Rate-limit-mønster:
   tjek FØR validering, succes decrementer aldrig.

## Status-kategorier

**VERIFICERET (2026-07-21):**
- main @ `6a81290` i produktion (Vercel READY, `/admin` svarer HTTP 200)
- DB sund: 35 trips, 13 destinationer (alle med hero), 7 profiler, audit-flows beviseligt aktive
  (`login_success`, `destination_image_uploaded` m.fl. i audit_log), 0 staging-rester
- **Japan, Kenya og Mauritius kan nu oprettes i produktion**: Admin → Destinationsbilleder →
  "Opret destination" → upload via signed-URL-flowet. (Ikke gjort endnu — venter på Mille.)
- Skema-drift: ingen (public-skemaet matcher `schema-baseline.json`)

**SANDSYNLIGT:**
- Vercel-teamet `unique-travel` understøtter cron-jobs (ubrugt — relevant for evt. staging-oprydning/drift-tjek)
- De ældre remote-branches kan slettes uden tab (alt er merged)

**UKENDT:**
- Om "Dispatch" kan oprette sessioner her (værktøjet ikke fundet på maskinen)
- Supabase-projektet `sujimigwcjkzpekkdpzf` nævnt i gamle kommentarer — findes det, og har det en rolle?
- Om image-library-stashen stadig repræsenterer ønsket funktionalitet

## Næste outcome

**Opsæt AI Project Automation Kit-dokumentationsgrundlaget** på branchen `docs/ai-operating-model`:
denne profil (Step 1) efterfulgt af de øvrige kit-dokumenter i kontrollerede, separate commits —
ingen produktkode, ingen Vision 2.0, ingen DB-ændringer undervejs.

*Derefter i køen (fra backloggen):* Mille opretter Japan/Kenya/Mauritius + billeder (ren drift, ingen kode) ·
#5 `created_by` ved trip-oprettelse (DB-siden klar) · #6 `parse_failures`-integration ·
beslutning om det døde slug-override-felt og image-library-stashen.
