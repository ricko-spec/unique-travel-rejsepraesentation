# Vision 3.0 Fase 5 — Gate B1: leverance og operatør-runbook til Gate B2/C/D

> [Issue #80](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/80). Den
> præcise operatør-runbook Issue #80's afleveringskrav punkt 10 beder om ("ingen secretværdier").
> Intet i denne fil må eller kan udføres af en agent alene — hvert trin kræver Rickos eksplicitte,
> separate godkendelse, jf. Issue #80's fire-gate-struktur.
>
> Revideret i PR #81 review-runde 1 (2026-09-24): transaktionelle RPC'er, prospektiv
> snapshot-kvalifikation, stage-kontrakt der skal udfyldes ved Gate C, dry-run-tilstand. Designet
> er beskrevet i `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md` (rev. 2).

## Hvad Gate B1 har leveret (PR #81)

- `supabase/013_conversion_measurement.sql` — migration, **anvendt i production ved Gate B2** (`20260924193406_conversion_measurement`): tre
  tabeller, frys-/guard-triggere, tre sync-RPC'er (`conversion_begin_sync_run`,
  `conversion_commit_sync_run`, `conversion_fail_sync_run`) + `conversion_parse_batch`.
- `src/lib/conversion/*` — kontrakt (v2), pseudonymisering, ren klassifikation, HubSpot-
  adapter-kontrakt + fixture, sync-motor, persistence (Supabase-RPC-adapter + in-memory fake der
  spejler RPC-semantikken), aggregering med privacy-model, wire-DTO.
- `src/app/admin/api/conversion/route.ts` + `src/app/admin/ConversionMeasurement.tsx` — admin-API
  og -UI, monteret i `/admin`, fail-closed "ikke startet" (også når tabellerne ikke findes).

## Hvad der IKKE er aktiveret (eksplicit liste)

- Migration 013 **er** kørt i production (Gate B2) — tabeller og RPC'er findes, men alle tre tabeller
  har **0 rækker**: ingen singleton-seed, ingen sync-kørsel, målingen er ikke startet.
- **Ingen** secrets er oprettet eller ændret (`HUBSPOT_PRIVATE_APP_TOKEN`,
  `HUBSPOT_DEAL_KEY_SECRET` findes ikke i Vercel).
- **Ingen** scheduler/cron, **ingen** rigtig HubSpot-klient, **ingen** live HubSpot-kald.
- Stage-kontrakten er **ufuldstændig** (`PIPELINE_STAGE_CONTRACT.complete = false`) — en officiel
  sync kan derfor ikke gennemføres, selv hvis alt andet blev aktiveret (fejler `CONTRACT_INCOMPLETE`).
- Admin-UI'et viser "Målingen er ikke startet endnu" i production indtil Gate D.
- PR #81 er merget (`c140e68`); Gate B2 er leveret i en separat PR (Issue #82).

## Gate B2 — migrationsgodkendelse — ✅ GENNEMFØRT 2026-09-24T19:34:06Z (Issue #82)

**Resultat:** preflight PASS (ingen drift, ingen 013-objekter, 010–012 registreret 1:1, production-
deploy af `c140e68` READY); migrationen anvendt præcis én gang som `20260924193406_conversion_measurement` via Supabase MCP
`apply_migration` (ikke SQL Editor, ikke `supabase db push` — sidstnævnte ville kræve
`migration repair`); alle post-verifikationspunkter grønne; 0 rækker; baseline opdateret (kun
013-objekter). Drift-tjekket blev kørt som den dokumenterede MCP-ækvivalent (samme
`schema_snapshot()`, kanonisk element-for-element-sammenligning), fordi `.env.local` med
service-role-nøglen ikke findes i agentens worktree. **Forbehold:** backup/PITR-status var ikke
synlig via de read-only værktøjer — accepteret af Ricko for denne rent additive migration.

Den oprindelige procedure (bevaret som reference):

**Forudsætning:** PR #81 er reviewet og merget efter Rickos OK.

1. Kør `supabase/013_conversion_measurement.sql` i SQL Editor mod projekt `iunixfpthdftmkgpugex`.
2. Verificér read-only (ingen writes, ingen syntetiske rækker):
   - de tre tabeller findes med kolonnerne i migrationsfilen; RLS aktiveret; én
     `service_role full access`-policy hver;
   - table grants: kun `service_role` har `SELECT, INSERT, UPDATE` (ingen `anon`/`authenticated`,
     ingen `DELETE`);
   - de fire funktioner er `SECURITY INVOKER`, `search_path = public, pg_catalog`, EXECUTE kun for
     `service_role`;
   - triggerne `conversion_measurement_state_guard` og `conversion_deal_cohort_guard` findes
     (`BEFORE INSERT OR UPDATE`); indekset `conversion_sync_runs_single_running_idx` er UNIQUE;
   - 0 rækker i alle tre tabeller.
3. Kør `node scripts/check-schema-drift.mjs --update-baseline` og commit `supabase/schema-baseline.json`
   + en statuslinje i `supabase/README.md`.
4. **Ingen scheduler, ingen HubSpot-secret** — Gate B2 stopper her.

## Gate C — aktivering (separat, eksplicit go)

> **Gate C1 (Issue #84) leverer trin 1, 2 og dry-run'en fra trin 5 — write-free:** komplet
> stagekontrakt v3 (18 stages, fire klasser inkl. `OUTCOME_WITHOUT_QUOTE_EVIDENCE` og
> `CLOSED_NO_QUOTE`), den rigtige snævre adapter og en lokal operatør-dry-run
> (`scripts/operator/Invoke-ConversionDryRun.ps1`). Se `docs/VISION-3.0-PHASE-5-GATE-C1.md`. Trin 3, 4, 6 (secrets, seed, cron)
> og versionsløftet af production-DB'ens `contract_version` (2 → 3) er **ikke** en del af C1.
> **Aktiveringsforudsætning fra C1:** migration 014 (kolonner + CHECK + frys-trigger for
> efterfølgende udelukkelse: `BOOKED_OTHER_REFERENCE_UNRESOLVED`/`INVALIDATED_DUPLICATE_OR_TEST`)
> skal være reviewet og anvendt, før nogen non-dry-run. **Leveret som fil i Gate C2 (Issue #86) —
> se § Gate C2 nedenfor.**
>
> **PR #85 (Gate C1) er merget** (`487fa64`, 2026-09-25).

1. **Udfyld stage-kontrakten (forudsætning).** Operatøren (Ricko) henter pipeline `754595640`'s
   komplette stage-liste read-only (samme operatør-kørte mønster som Gate A — agenten ser aldrig
   tokenet). Ricko klassificerer HVER stage som `PRE_QUOTE`, `QUOTE_OR_LATER` eller
   `CLOSED_AMBIGUOUS` (se ADR'ens tabel). En PR tilføjer dem i `PIPELINE_STAGE_CONTRACT`, sætter
   `complete: true` og bumper `CONTRACT_VERSION` (3); samme PR opdaterer
   `conversion_measurement_state.contract_version`-default og runbooken. Kun stage-id'er og
   klassifikation committes — aldrig deal-data.
2. Byg den rigtige `HubSpotReadAdapter` (mod `api.hubapi.com`, read-only): `confirmStageContract`
   returnerer pipelinens komplette stage-liste; `readDealsPage` bruger søgning filtreret på
   pipelinen, returnerer HubSpots `total` på hver side og præcis felterne i
   `HubSpotDealObservation`. Fejl mappes til kategoriske årsager — aldrig rå payloads. Testes mod
   fixtures før første live-kald.
3. Opret HubSpot Private App-token (read-only: `crm.objects.deals.read`, `crm.schemas.deals.read`)
   og en ny, uafhængig `HUBSPOT_DEAL_KEY_SECRET` (`openssl rand -hex 32` — ALDRIG samme værdi som
   `BOOKING_MATCH_SECRET`; motoren afviser ens eller kortere end 32 tegn). Sæt dem som
   server-side-only miljøvariabler i Vercel. Aldrig i repoet.
4. Seed singleton-rækken: `insert into conversion_measurement_state (id) values (1);`
   (status `NOT_STARTED`; triggeren afviser et seed med tidsstempler).
5. **Dry-run FØRST:** kør `runConversionSync(..., { dryRun: true })` via en server-side route/script.
   Dry-run læser HubSpot, verificerer stage-kontrakten, læser `trips` og kohorten komplet og
   klassificerer — men skriver INTET (heller ingen sync-run). Kontrollér kun de returnerede
   aggregater sammen med Ricko.
6. Opret ÉN daglig Vercel Cron, der kalder en server-side-only route med `runConversionSync()`.
   Den gør intet før Gate D (status `NOT_STARTED` ⇒ `NOT_ACTIVE`, ingen skrivning).
7. Rollback: fjern cronnen; secrets kan fjernes uden datatab.

> **Trin 3, 4 og 6 er konkretiseret i § Gate D nedenfor** (Issue #89): routen er
> `GET /api/internal/conversion/sync` med `CRON_SECRET`; rækkefølgen er secrets → preflight → seed →
> `ACTIVE` → operatørstyret baseline → cron som separat aktiverings-PR.

## Gate C2 — migration 014 og databasekontrakt v3 (Issue #86) — ✅ ANVENDT 2026-09-28T10:32:48Z

**Resultat:** PR #87 merget (`a11516a`); drift-kontrol BESTÅET (MCP-ækvivalent, 287/287,
fingerprint `453e5ad9…1777`); preflight PASS; anvendt præcis én gang som `20260928103248_conversion_post_enrollment_v3`
(lagret SQL = filen, sha256 `291ead2e…164c`); post-verifikation grøn (se `docs/CHECKPOINT.md`);
0 rækker, ingen singleton-række; baseline opdateret (kun 014-objekter). Den write-free operatør-
dry-run kan køres igen (skema og kode matcher), men kræver ny godkendelse. Intet aktiveret.

Den oprindelige leverance og procedure (bevaret som reference):

Leveret: `supabase/014_conversion_post_enrollment_v3.sql`, rollback-SQL i
`supabase/rollback/014_conversion_post_enrollment_v3_rollback.sql`, v3-skrivevej i
`persistence.ts` (`conversion_commit_sync_run_v3`), fælles kolonneliste (`COHORT_COLUMNS`) for
sync-motor og admin-loader, og `src/lib/conversion/migration014.sql.test.ts` (pglite, kører i CI).
Detaljer: `supabase/README.md` § Migration 014.

**Vigtigt om rækkefølgen:** efter merge af Gate C2-PR'en kalder koden v3-RPC'en og læser de nye
kolonner. Mod production (013) betyder det: en commit fejler lukket (`COMMIT_REJECTED`, RPC findes
ikke) og en kohortelæsning fejler lukket (ukendt kolonne ⇒ `SOURCE_READ_FAILED`). Den write-free
operatør-dry-run fra C1 kan derfor først køres igen, når 014 er anvendt. Admin-visningen påvirkes
ikke, så længe der ikke findes en singleton-række (den læser ikke kohorten før målingsstart).

### Procedure for anvendelse (separat, eksplicit go — ikke en del af C2)

1. **Drift-kontrol FØRST:** `node scripts/check-schema-drift.mjs` mod production skal give exit 0
   (ingen uforklaret drift). Fejler den, stop.
2. Preflight read-only: 0 rækker (eller: ingen startet måling), migrationshistorik 1:1, ingen cron.
3. Anvend `014_conversion_post_enrollment_v3.sql` præcis én gang via Supabase MCP `apply_migration`.
4. Post-verifikation read-only: de to kolonner, 5 CHECKs (validated), to nye triggere, v3-RPC'erne
   SECURITY INVOKER med fast `search_path` og EXECUTE kun `service_role`, 013's commit/parse uden
   EXECUTE for `service_role`, table grants uændrede (kun `service_role` SELECT/INSERT/UPDATE),
   `contract_version`-default = 3, rækketal uændret.
5. `node scripts/check-schema-drift.mjs --update-baseline` og commit baselinen (kun 014-objekter).
6. Stadig ingen seed/secrets/cron/`ACTIVE` — det er Gate C-aktivering/Gate D.

Rollback: se `supabase/README.md` § Migration 014 (blokerer med vilje, hvis markeringer findes).

## Gate D — kontrolleret aktivering (Issue #89) — forberedt, IKKE aktiveret

> Leveret i Gate D-PR'en (Issue #89): sync-routen `GET /api/internal/conversion/sync`
> (`src/app/api/internal/conversion/sync/route.ts` + `src/lib/conversion/syncRoute.ts`), operatør-
> wrapperen `scripts/operator/Invoke-ConversionSync.ps1` og visning af seneste sync-kørsel i admin.
> **Intet er aktiveret.** Hvert trin nedenfor kræver Rickos eksplicitte, separate go og udføres i
> præcis denne rækkefølge. Stop ved første afvigelse — ingen retry-loop, ingen "reparation" med writes.

### Hvad routen gør (uændret motor)

Rækkefølge (fail-closed): (1) `Authorization: Bearer $CRON_SECRET` (konstant-tid; manglende server-
secret ⇒ 401), (2) kun `VERCEL_ENV=production` (preview deler production-DB ⇒ 403), (3) HubSpot-token
og de to HMAC-secrets ⇒ ellers `CONFIG_INVALID` uden læsning/skrivning, (4) `runConversionSync`.
Uden singleton-række eller med `NOT_STARTED`/`PAUSED` gør den intet (`200 SKIPPED NOT_ACTIVE`).

| HTTP | `result` | Betydning |
|---|---|---|
| 200 | `SUCCEEDED` | Commit gennemført (`baseline` true/false, `observed` = total, 1–9 skjult) |
| 200 | `SKIPPED` | Målingen er ikke ACTIVE — intet læst fra HubSpot, intet skrevet |
| 401 / 403 | `REJECTED` | Forkert/manglende `CRON_SECRET` / ikke production |
| 409 | `FAILED` | `SYNC_ALREADY_RUNNING` — en anden kørsel holder leasen |
| 500 | `FAILED` | `CONFIG_INVALID` — manglende/ugyldige secrets |
| 502 | `FAILED` | Alt andet (HubSpot, kontraktdrift, paginering, Supabase, commit) — FAILED-run med kode |

Svaret og loggen (`[conversion-sync] result=… code=…`) er kun kategoriske.

### Secrets (Vercel, KUN miljøet "Production")

| Navn | Status | Indhold |
|---|---|---|
| `BOOKING_MATCH_SECRET` | Findes (Analytics Bridge, Issue #45) — bekræft at den er sat for Production | Uændret |
| `HUBSPOT_PRIVATE_APP_TOKEN` | **Ny** | Private App-token, kun `crm.objects.deals.read` + `crm.schemas.deals.read` |
| `HUBSPOT_DEAL_KEY_SECRET` | **Ny** | `openssl rand -hex 32` — ALDRIG lig `BOOKING_MATCH_SECRET`. **Må aldrig roteres efter baseline** (deal-nøglerne ville ændre sig, og kohorten kunne ikke genkendes). Gem den i password-manageren |
| `CRON_SECRET` | **Ny** | `openssl rand -hex 32` — Vercel Cron sender den automatisk som Bearer |

Ingen af dem må sættes for Preview/Development. Env-ændringer kræver et nyt production-deploy.

### Aktiveringsrækkefølge

**D0. Merge Gate D-PR'en** (Rickos OK) → production-deploy READY.
Kontrol (read-only): `GET /api/internal/conversion/sync` uden header ⇒ **401**.

**D1. Secrets** (Ricko i Vercel, se tabellen) → redeploy production.
Kontrol: `Invoke-ConversionSync.ps1` ⇒ **200 `SKIPPED` `NOT_ACTIVE`**. Det beviser auth, production-
værnet og at token + HMAC-secrets er brugbare, uden at HubSpot kaldes eller noget skrives.
*Stop hvis:* 401 (forkert `CRON_SECRET`), 403 (ikke production), 500 `CONFIG_INVALID`.

**D2. Preflight (read-only)** umiddelbart før seed:
- drift-kontrol PASS (script eller MCP-ækvivalent, se Gate C2);
- 0/0/0 rækker, ingen singleton-række, 15 migrationer (senest `20260928103248`), ingen cron-schema;
- production-deploy af den mergede Gate D-kode READY.
- Valgfrit: C1's write-free operatør-dry-run igen (stagekontrakt MATCH med den skærpede
  label/displayOrder/archived-verifikation — den er endnu ikke kørt live).
*Stop hvis:* drift, rækker ≠ 0, kontrakt ≠ MATCH.

**D3. Singleton-seed** (Rickos go, via Supabase MCP):
`insert into public.conversion_measurement_state (id) values (1);`
Kontrol: `status = NOT_STARTED`, `contract_version = 3`, `measurement_started_at` NULL, `sync_generation` 0.
Admin viser fortsat "Målingen er ikke startet".

**D4. ACTIVE** (Rickos Gate D-go, via Supabase MCP):
`update public.conversion_measurement_state set status = 'ACTIVE' where id = 1;`
Kontrol: `measurement_started_at` stadig NULL. Admin: "aktiveret og afventer den første officielle
baseline-synkronisering". (Findes der allerede en daglig cron, kan den nu køre baseline — derfor
kommer cron først i D6.)

**D5. Første baseline** — Ricko kører `scripts/operator/Invoke-ConversionSync.ps1`.
Forventet: **200 `SUCCEEDED` `baseline=True`**, `observed` ≈ antal deals i pipelinen (C1: 2.652).
Kontrol (read-only): `measurement_started_at` = kørslens tidspunkt, `sync_generation` 1, én
`SUCCEEDED`-kørsel med `is_baseline = true`, kohorterækker = observeret, **0 `ENROLLED`**.
*Stop hvis:* andet end 200 `SUCCEEDED`. Kør IKKE igen i blinde: læs `conversion_sync_runs.error_code`.
En mislykket baseline lader `measurement_started_at` være NULL og kan genkøres sikkert, når årsagen
er forstået (bevist i `syncRoute.test.ts` og `migration014.sql.test.ts`). `COMMIT_REJECTED` på
baseline kan skyldes batchstørrelsen (~2.650 rækker i ét RPC-kald, kendt begrænsning) ⇒ stop og
vurdér. Ved gentagne fejl: `PAUSED` (se rollback).

**D6. Daglig scheduler** — separat aktiverings-PR (Rickos OK) med præcis denne `vercel.json`:

```json
{
  "crons": [{ "path": "/api/internal/conversion/sync", "schedule": "0 3 * * *" }]
}
```

(03:00 UTC ≈ 05:00 dansk sommertid; Vercel Hobby kan afvige inden for timen.) Kontrol efter merge:
cronnen er listet i Vercel → Settings → Cron Jobs; næste morgen viser admin "Seneste synkronisering
gennemført" og ingen STALE-advarsel.

### Rollback og pause

| Situation | Handling | Konsekvens |
|---|---|---|
| Stop kørsler | `update public.conversion_measurement_state set status = 'PAUSED' where id = 1;` | `begin` afviser; routen svarer `SKIPPED`; intet data tabes. Genstart = `ACTIVE` (samme godkendelse) |
| Stop scheduler | Revert af D6-PR'en (eller slå cron fra i Vercel) | Ingen kald; data urørt |
| Træk adgang tilbage | Fjern `CRON_SECRET` / HubSpot-token i Vercel + redeploy | Routen svarer 401 / 500 `CONFIG_INVALID` |
| Mislykket baseline | Intet at rulle tilbage (kun en FAILED-revisionsrække) | Kan genkøres, når årsagen er forstået |
| Efter gennemført baseline | `measurement_started_at` er uforanderlig (trigger) | Nulstilling kræver sletning af data = destruktivt, separat beslutning (KRÆVER RICKO) |

### Fejlalarmering

- **Admin** (`/admin` → Konverteringsmåling): seneste kørsel (tid, status, observeret total) og en
  rød fejlboks med fejlkode ved `FAILED`; rød STALE-advarsel, når seneste succesfulde sync er > 36 t.
- **Vercel-logs**: `[conversion-sync] result=FAILED code=…` (console.error) og ikke-2xx-status på cron-
  kaldet. Ingen e-mail-/Slack-alarm i denne gate (kræver ny integration — separat beslutning).

### Hvad admin viser efter første baseline

- Målingsstart = baseline-tidspunktet; "Seneste baseline-synkronisering gennemført … · N deals observeret".
- Begge grupper: **0 optagne** — baseline optager ingen deals (alle eksisterende er
  `PRE_START_EXISTING` eller `ELIGIBLE_PENDING`), så "Ikke nok data endnu til en sammenligning".
- Datakvalitet: observeret i alt, `ELIGIBLE_PENDING` og `PRE_START_EXISTING` (C1-dry-run: 163 /
  2.489 — tallene kan have flyttet sig), øvrige tal enten 0 eller "skjult (lille tal)".
- Fra næste daglige kørsel optages nye deals og `ELIGIBLE_PENDING`-deals, der for første gang ses i
  "Tilbud sendt"/"Opdateret tilbud" (kohortestart = den kørsels tidspunkt), med frosset eksponering
  ONLINE/PDF_ONLY. `PRE_START_EXISTING` optages aldrig.

### Hvornår tal bliver synlige (30/60/90 dage og privacy)

- En deal er moden for vinduet W, når W dage er gået siden dens kohortestart. Rater for 30/60/90
  dage kan tidligst vises 30/60/90 dage efter, at de første deals er optaget (dvs. efter første
  daglige kørsel efter baseline).
- En celle publiceres kun, når nævner n, bookede b og ikke-bookede n−b **alle er ≥ 10** i begge
  grupper, og kun i lukkede, hierarkiske publiceringsblokke (ingen lille celle eller komplement kan
  udledes — heller ikke dag for dag eller mellem 30/60/90). Tal 1–9 vises aldrig ("skjult").
- Konsekvens: realistisk går der flere måneder, før en 30-dages-sammenligning vises; 90-dages-
  tallet kræver mindst 90 dage plus nok bookede OG ikke-bookede deals i begge grupper. Hvor hurtigt
  afhænger alene af, hvor mange nye tilbud der sendes efter målingsstart.
- Tallene er en observeret sammenhæng mellem eksponering og booking, ikke bevist årsag.

## Drift: fejlkoder og crash

Udelukkelsesårsager i kohorten: `MISSING_BOOKING_NO`, `INVALID_BOOKING_NO_FORMAT`,
`SHARED_BOOKING_REFERENCE`, `CLOSED_BEFORE_QUALIFIED_OBSERVATION`,
`BOOKED_BEFORE_QUALIFIED_OBSERVATION`. Efterfølgende udelukkelse af en optaget deal (migration 014,
ikke anvendt endnu): `BOOKED_OTHER_REFERENCE_UNRESOLVED`, `INVALIDATED_DUPLICATE_OR_TEST`.

`conversion_sync_runs.error_code` er en af: `CONFIG_INVALID`, `NOT_ACTIVE`,
`CONTRACT_VERSION_MISMATCH`, `CONTRACT_INCOMPLETE`, `CONTRACT_DRIFT`, `HTTP_401/403/429/5XX`,
`NETWORK_ERROR`, `PAGE_INCONSISTENT`, `TOTAL_MISMATCH`, `DUPLICATE_DEAL`, `EMPTY_SOURCE`,
`SOURCE_READ_FAILED`, `SYNC_ALREADY_RUNNING`, `COMMIT_REJECTED`, `ABANDONED`, `UNKNOWN`
(`CONFIG_INVALID`, `NOT_ACTIVE`, `CONTRACT_VERSION_MISMATCH`, `SYNC_ALREADY_RUNNING` afvises før en
lease og skrives derfor ikke som række). En kørsel der crasher, efterlader en RUNNING-række uden
kohortedata; efter 30 minutter markeres den `ABANDONED` af næste kørsel.

## Kendte, dokumenterede begrænsninger

- Den rigtige HubSpot-adapter og den komplette stage-kontrakt er Gate C-arbejde (se ovenfor).
- Commit-batchen sendes som ét RPC-kald (~2.600 rækker ≈ 1–2 MB JSON server→Supabase; Vercels
  4,5 MB-grænse gælder kun indgående requests). Skal bekræftes i Gate C's dry-run/første kørsel.
- Privacy: se ADR'ens "Resterende, dokumenteret risiko" (tilbageholdte tællinger; sent opdagede
  konflikter i allerede publicerede blokke). Risikoen ved sent opdagede konflikter er **eksplicit
  accepteret af Ricko 2026-09-24** for den interne, admin-beskyttede visning — ingen snapshots.
  Genvurderes, hvis tallene nogensinde vises uden for admin. Modning er pr. deal (Issue #80); nyligt modnede deals
  kan være tilbageholdt i publiceringslaget, indtil en blok lukker.
- En deal, der får UT-solgt-status før den observeres i "Tilbud sendt eller senere", udelukkes
  (`BOOKED_BEFORE_QUALIFIED_OBSERVATION`) og vises i datakvalitet.
- En deal der går fra `PRE_QUOTE` til en tvetydig lukket stage mellem to syncs, udelukkes
  (`CLOSED_BEFORE_QUALIFIED_OBSERVATION`) og vises i datakvalitet.
