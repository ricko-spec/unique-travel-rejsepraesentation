# AGENTS.md — fælles agent-regler

Gælder for ALLE AI-agenter der arbejder på dette projekt: ChatGPT, Claude Cowork/Dispatch
og Claude Code. Ved konflikt mellem denne fil og en agents egne instruktioner vinder denne fil.
Kilder: `docs/PROJECT_PROFILE.md` (tilstand) og `docs/SYSTEM-ARKITEKTUR.md` (teknik).

## Roller

| Rolle | Ansvar |
|---|---|
| **Ricko** | Produktejer. Eneste der godkender merge, deploy og beslutninger markeret KRÆVER RICKO |
| **ChatGPT** | Planlægning, review af dokumenter/planer, sparring. Skriver ikke kode i repoet |
| **Claude Cowork/Dispatch** | Design, planlægning, handoffs, opgavebeskrivelser. Skriver SQL-udkast og briefs — deployer ikke |
| **Claude Code** | Implementering: kode, migrationer, checks, preview-deploys via branch-push. Se `CLAUDE.md` |
| **Mille** | Drift af destinationsbilleder (eneste bruger af upload-flowet). Ikke en agent |

## Git-regler

1. **`main` = production.** Hvert push til main er en produktionsudgivelse (Vercel auto-deploy).
2. Alt arbejde sker på **feature-branches** fra opdateret `main`, i **git worktrees** —
   Desktop-checkoutet (`feature/individuelle-logins-profiles`) røres ikke.
3. Flow: branch → commits → push → Vercel-preview → **Rickos eksplicitte OK** → fast-forward-merge
   (foretrukket) → evt. branch-oprydning. Ingen merge uden OK. Ingen force-push til main.
4. `stash@{0}` ("image-library WIP") bevares indtil Ricko beslutter andet. Slet ikke branches
   uden eksplicit besked.
5. Commit-beskeder på dansk, beskrivende, med scope-prefix (`feat:`, `fix:`, `docs:`, `chore:`).

## Data- og adgangsgrænser

- Detaljeret matrix: `docs/ACCESS_MATRIX.md`. Kort version:
- **Preview-deploys deler production-DB og -Storage.** Alt du skriver via preview er ægte data.
- Projektets Supabase (`iunixfpthdftmkgpugex`) indeholder **Unique Travel-kundedata**
  (rejsende-navne, rejseplaner). Læs kun hvad opgaven kræver; kundedata må aldrig ende i
  repo, commits, logs, dokumenter eller chat-output ud over det nødvendige.
- **Forbudt for alle agenter:** THF/Unique Travels interne systemer — SharePoint, VPN,
  mail, fællesdrev. Ingen undtagelser; bed Ricko om evt. materiale derfra.
- **Secrets** (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, anon-nøgle, adgangskoder)
  må ALDRIG logges, printes, committes eller citeres — heller ikke delvist. Env-var-NAVNE er OK.
- Repoet er **public** — alt der committes er offentligt. Ingen screenshots, PDF'er eller kundedata.

## Databaseændringer

- Ny DDL = ny nummereret migrationsfil (`supabase/009_*.sql` og frem), idempotent, kørt live og
  committet **i samme ombæring** sammen med `node scripts/check-schema-drift.mjs --update-baseline`.
- Kendt blind vinkel: Storage-bucket-config fanges ikke af drift-tjekket — dokumentér bucket-ændringer
  eksplicit i commit + `docs/DECISIONS.md`.
- Ingen destruktive DB-operationer (DROP/DELETE/TRUNCATE på data) uden Rickos eksplicitte OK.

## Testkrav

Før push af kode-ændringer (ikke ren markdown): `npm run typecheck` + `npm run lint` grønne;
`npm run build` ved ændringer i routes/config; drift-tjek ved DB-arbejde.
Fuldt overblik og manuelle testlister: `docs/TESTING.md`. Der findes ingen automatiske tests (kendt hul).

## Stopbetingelser — stop og spørg Ricko når:

- En handling er svær at rulle tilbage (merge til main, DB-skema, sletning af data/branches/stash)
- En designbeslutning ikke er dækket af opgaven eller `docs/DECISIONS.md`
- Noget i virkeligheden modsiger dokumentationen eller opgavebeskrivelsen
- En opgave kræver adgang uden for `docs/ACCESS_MATRIX.md`
- Et check fejler og årsagen ikke er entydig
- Punkter markeret **KRÆVER RICKO** i roadmap/beslutningslog berøres

## Sandhedshierarki

Koden på `origin/main` > den levende DB > `docs/SYSTEM-ARKITEKTUR.md` > øvrige docs > hukommelse.
Verificér før du påstår. Opdatér dokumentationen når virkeligheden har ændret sig — i samme branch.
