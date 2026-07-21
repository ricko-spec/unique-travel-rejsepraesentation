# CLAUDE.md — Unique Travel Rejsepræsentation

Følg de fælles agent-regler i **@AGENTS.md** — de vinder ved konflikt.

## Læs først

- `docs/STATUS.md` — aktuel tilstand (læs ved sessionstart)
- `docs/PROJECT_PROFILE.md` — identitet, toolchain, husregler
- `docs/SYSTEM-ARKITEKTUR.md` — dyb teknisk reference (routes, DB, flows)
- `docs/DECISIONS.md` / `docs/ROADMAP.md` — hvad der er besluttet og hvad der er næst

## Arbejdsform

1. **Aldrig direkte på main eller Desktop-checkoutet.** Ny branch fra opdateret `main`,
   arbejd i et git worktree (scratchpad), push → Vercel-preview → afvent Rickos OK → fast-forward-merge.
2. `npm ci` før lokal kørsel (sharp er dependency; Desktop-node_modules kan være bagud).
3. Checks før push af kode: `npm run typecheck` && `npm run lint`; `npm run build` ved route/config-ændringer;
   `node scripts/check-schema-drift.mjs` ved DB-arbejde. Kommandoer og testlister: `docs/TESTING.md`.
4. Review din egen diff (`git diff main..HEAD --stat`) før push — kun de filer opgaven kræver.
5. DB: ny nummereret migration + `--update-baseline` i samme ombæring. Bucket-config er drift-tjekkets blinde vinkel.

## Husk

- **main = production** (`rejseplaner.uniquetravel.dk`). Preview deler production-DB/-Storage — test-data er ægte.
- Service-role-nøglen kun i `src/lib/supabase/server.ts`. Intro-ændringer kun via intro-endpointet.
  Intro-stil differentieres aldrig pr. sælger. Audit via `src/lib/audit.ts` (typed actions).
- Vercel afviser request-bodies > 4,5 MB — store filer går direkte til Supabase Storage (signed URLs).
- Repoet er public: ingen secrets, kundedata eller screenshots i commits.
- `stash@{0}` (image-library WIP) er fredet. Slet ikke branches uden besked.

## Stop og spørg (fra AGENTS.md)

Merge/deploy, destruktive handlinger, udokumenterede designbeslutninger, adgang uden for
`docs/ACCESS_MATRIX.md`, uklare check-fejl, alt markeret KRÆVER RICKO.
