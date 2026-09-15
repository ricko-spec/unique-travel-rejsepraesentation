# PROJECT_PROFILE — Unique Travel Rejsepræsentation

> Stabil identitet og toolchain — ændres kun når identitet/toolchain faktisk ændrer sig.
> **Live git-/production-/test-status bor i `docs/STATUS.md`, ikke her.**
> Ved uoverensstemmelse mellem denne profil og koden: koden vinder — opdatér profilen.

## Identitet

- **Projekt:** Intern Next.js 14-webapp: TravelWire-PDF → Claude-parsing → kode-låst kundepræsentation
- **Lokal sti:** `C:\Users\tilde\Desktop\uniquetravel-rejsepraesentation`
- **Repo:** `ricko-spec/unique-travel-rejsepraesentation` (GitHub, PUBLIC — ingen secrets eller kundedata i repo)
- **Default branch:** `main` · **Produktion:** Vercel auto-deploy ved push til main → `rejseplaner.uniquetravel.dk`
- **Backend:** Supabase `iunixfpthdftmkgpugex` (Postgres 17, eu-west-1) — data, auth, storage.
  **Deles af preview OG produktion** — test-data i preview er ægte data.
- **Brugere:** Unique Travels sælgere (7 profiler) + Mille (destinationsbilleder). Kunder ser kode-låste præsentationer.

## Toolchain

- **Package manager:** npm (`package-lock.json`; ingen yarn/pnpm)
- **Scripts:** `dev` / `build` / `start` / `lint` / `typecheck` / `test` (Vitest — se `docs/TESTING.md`)
- **OBS:** `sharp` er dependency på main — checkouts uden frisk `npm install` mangler den i
  `node_modules`. Kør altid `npm install`/`npm ci` før lokal kørsel.
- **Arbejdskonvention:** alt agent-arbejde foregår i git worktrees under scratchpad —
  Desktop-checkoutet røres ikke.

## Miljøvariabler (navne — værdier ligger KUN i `.env.local` og Vercel project settings)

`ANTHROPIC_API_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`

Lokalt: `.env.local` findes (gitignored). Service-role-nøglen valideres kryptografisk ved opstart
(`src/lib/supabase/server.ts`) og må aldrig forlade server-side kode.

## Dokumentation

- `docs/SYSTEM-ARKITEKTUR.md` — komplet systembeskrivelse (routes, DB, flows)
- `supabase/README.md` + nummererede migrationer (`001-008_*.sql`, idempotente) +
  `schema-baseline.json` (grundlag for drift-tjekket)
- `README.md` (setup) · `AGENTS.md` / `CLAUDE.md` (fælles + operationelle agent-regler) ·
  `docs/STATUS.md` (live status, læs ved sessionstart)

## Husregler

1. **Push til main = produktionsudgivelse.** Preview-test + Rickos eksplicitte OK FØR merge.
   Fast-forward foretrækkes.
2. Preview-deploys ligger bag Vercel Authentication og deler produktions-DB/-Storage.
3. Service-role-nøglen kun i `src/lib/supabase/server.ts`. Intro-ændringer kun via
   intro-endpointet. Intro-stilen differentieres aldrig pr. sælger (brand-beslutning).
4. **Ny DDL = ny nummereret migrationsfil (009+) + `node scripts/check-schema-drift.mjs
   --update-baseline` i samme ombæring.** Storage-bucket-config er drift-tjekkets kendte
   blinde vinkel (`destinations`: 50 MB file_size_limit + MIME-allowlist, i `storage`-skemaet).
5. Vercel serverless afviser request-bodies > 4,5 MB — filer uploades direkte til Supabase
   Storage via signed URLs (se destinations-flowet). Parse-routen har samme latente grænse.
6. Audit via central `src/lib/audit.ts` (typed actions, best-effort). Rate-limit-mønster:
   tjek FØR validering, succes decrementer aldrig.
