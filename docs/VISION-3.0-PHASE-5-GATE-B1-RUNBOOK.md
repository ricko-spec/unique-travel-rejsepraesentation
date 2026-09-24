# Vision 3.0 Fase 5 — Gate B1: leverance og operatør-runbook til Gate B2/C/D

> [Issue #80](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/80). Denne fil
> er den præcise operatør-runbook Issue #80's afleveringskrav punkt 10 beder om ("ingen
> secretværdier"). Intet i denne fil må eller kan udføres af en agent alene — hvert trin kræver
> Rickos eksplicitte, separate godkendelse, som beskrevet i Issue #80's fire-gate-struktur.

## Hvad Gate B1 har leveret (denne PR)

- `supabase/013_conversion_measurement.sql` — migration, **bygget som fil, IKKE anvendt**.
- `src/lib/conversion/*` — ren sync-/klassifikationslogik, persistence-adaptere (Supabase + in-
  memory fake), HubSpot-adapter-kontrakt + fixture, aggregeringslogik med small-cell/komplementær
  undertrykkelse. 75 nye tests, alle grønne.
- `src/app/admin/api/conversion/route.ts` + `src/app/admin/ConversionMeasurement.tsx` — admin-API
  og -UI, monteret i `/admin`, fail-closed "ikke startet"-tilstand (håndterer også at tabellerne
  endnu ikke findes i production — se `src/lib/conversion/adminServer.ts`).
- `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md` — arkitekturvalg A, trusselsmodel, dataflow, invariants,
  rollback.

## Hvad der IKKE er aktiveret (eksplicit liste)

- Migrationen er **ikke** kørt i production. `conversion_measurement_state`,
  `conversion_deal_cohort` og `conversion_sync_runs` findes **ikke** i den levende database endnu.
- **Ingen** secrets er oprettet eller ændret (`HUBSPOT_PRIVATE_APP_TOKEN`,
  `HUBSPOT_DEAL_KEY_SECRET` findes ikke i Vercel endnu).
- **Ingen** scheduler/cron er oprettet eller aktiveret.
- **Ingen** live HubSpot-kald er foretaget af nogen agent i denne PR — al testdækning bruger
  `createFixtureHubSpotAdapter`/`createInMemoryConversionPersistence`.
- `conversion_measurement_state.measurement_started_at` er ikke sat — kan ikke være det, tabellen
  findes ikke.
- Admin-UI'et viser derfor altid "Målingen er ikke startet endnu" i production, indtil Gate D.
- PR'en er **ikke merget**.

## Gate B2 — migrationsgodkendelse (kræver Rickos eksplicitte go)

**Forudsætning:** PR'en er reviewet og godkendt til merge først (denne PR selv stopper ved
review-/migrationsgaten, som instrueret).

1. Merge PR'en til `main` (almindelig merge-commit, Rickos eksplicitte OK — samme proces som
   Gate A/PR #79).
2. Kør `supabase/013_conversion_measurement.sql` i [SQL Editor](https://supabase.com/dashboard/project/iunixfpthdftmkgpugex/sql/new)
   mod projekt `iunixfpthdftmkgpugex` — samme rækkefølge som migration 010-012.
3. Verificér read-only (ingen writes, ingen syntetiske rækker):
   - `conversion_measurement_state`, `conversion_deal_cohort`, `conversion_sync_runs` findes med de
     forventede kolonner (se migrationsfilens kommentarer).
   - RLS aktiveret på alle tre, én `service_role full access`-policy hver.
   - Table grants: kun `service_role` har `SELECT, INSERT, UPDATE` (ingen `anon`/`authenticated`,
     ingen `DELETE`) — samme mønster som migration 011/012.
   - `conversion_measurement_state_guard_started_at`-triggeren findes og er `BEFORE UPDATE`.
   - Row count: 0 i alle tre tabeller (ingen singleton-række er endnu oprettet — det sker IKKE af
     denne migration, bevidst, se migrationsfilens kommentar).
4. Kør `node scripts/check-schema-drift.mjs --update-baseline` og commit den opdaterede
   `supabase/schema-baseline.json` sammen med en kort statusopdatering af
   `supabase/README.md` (samme mønster som 010-012's driftsnoter).
5. **Ingen scheduler, ingen HubSpot-secret endnu** — Gate B2 stopper her.

## Gate C — aktivering (separat, eksplicit go)

1. Opret HubSpot Private App-token (read-only scopes: `crm.objects.deals.read`,
   `crm.schemas.deals.read`, pipeline-læse-scope) — samme token-klasse som Gate A brugte, men et
   NYT token bør overvejes for produktions-drift frem for at genbruge et evt. ad hoc-token fra
   Gate A's undersøgelse.
2. Generér en ny, uafhængig `HUBSPOT_DEAL_KEY_SECRET` (fx `openssl rand -hex 32`) — ALDRIG samme
   værdi som `BOOKING_MATCH_SECRET` eller `ANALYTICS_BRIDGE_API_KEY`.
3. Sæt begge som server-side-only miljøvariabler i Vercel → Project Settings → Environment
   Variables (production, og evt. preview) — aldrig i repoet, `.env.local` deles aldrig.
4. Seed singleton-rækken i `conversion_measurement_state` (status fortsat `NOT_STARTED`,
   `measurement_started_at` fortsat `NULL`) — første eksplicitte `INSERT` i denne tabel.
5. Opret ÉN daglig Vercel Cron (`vercel.json` eller Vercel-dashboardet) der kalder en ny,
   server-side-only cron-route, som selv kalder `runConversionSync()` med en RIGTIG
   `HubSpotReadAdapter` (implementeres i Gate C, ikke i denne PR — Gate B1 leverer kun
   adapter-kontrakten + fixture).
6. **Dry-run FØRST**: kør synkroniseringen manuelt mod production med
   `conversion_measurement_state.status` fortsat `NOT_STARTED` — `runConversionSync()` afviser da
   at klassificere noget (se `syncEngine.ts`'s eksplicitte NOT_STARTED-guard) og skriver kun et
   `FAILED`-run med en klar, forventet årsag. Bruges til at bekræfte at selve HubSpot-forbindelsen,
   pipeline-/stage-kontrakten og pagineringen virker, UDEN at kunne skrive noget som helst til
   kohorten.
7. Kontrollér data-health/dry-run-outputtet (kun aggregater) sammen med Ricko før Gate D.
8. Rollback: sæt `conversion_measurement_state.status = 'PAUSED'` for at stoppe fremtidige syncs
   uden datatab; fjern cronnen for at stoppe helt.

## Gate D — officiel start (separat, eksplicit go)

1. Ricko godkender eksplicit at målingen må starte NU.
2. Operatøren opdaterer `conversion_measurement_state`: `status = 'ACTIVE'`,
   `measurement_started_at = now()` (ÉN gang — uforanderlig herefter, håndhævet af DB-triggeren).
3. Første succesfulde sync klassificerer alle aktuelt kendte deals: allerede-kvalificerede (var på
   "Tilbud sendt" eller senere FØR `measurement_started_at`) bliver `PRE_START_EXISTING` og tæller
   ALDRIG med i konverteringsmålingen — dette er selve mekanismen der forhindrer skjult historisk
   backfill.
4. Dokumentér kun AGGREGEREDE baseline-tal (antal `PRE_START_EXISTING` / `ELIGIBLE_PENDING` /
   `ENROLLED` ved første kørsel) i `docs/STATUS.md` — aldrig deal-id'er eller bookingnumre.
5. Admin-smoke-test: log ind som sælger, åbn `/admin`, bekræft at
   "Konverteringsmåling"-sektionen nu viser målingsstart + tal (eller "Ikke nok data endnu", hvis
   ingen gruppe er moden/stor nok endnu — det er korrekt, forventet adfærd, ikke en fejl).
6. Herefter er kohorten officielt i gang. Enhver senere pause/genstart kræver samme
   godkendelsesniveau som denne gate.

## Kendte, dokumenterede begrænsninger (ikke blokerende for Gate B1, men bør kendes før Gate C)

- Den rigtige `HubSpotReadAdapter`-implementering (mod `api.hubapi.com`) er **ikke bygget** i Gate
  B1 — kun kontrakten (`src/lib/conversion/hubspotAdapter.ts`) og en fixture. Gate C skal bygge
  denne, matchende de nøjagtige `confirmStageContract`/`readDealsPage`-semantikker, testet mod
  fixtures FØR første live-kald.
- Outcome-formlen (`unique_travel_dealstatus` i sold-bucket ⇒ Booket; `hs_is_closed` uden
  `hs_is_closed_won` ⇒ `lost_observed_at`) er en dokumenteret, rimelig FORTOLKNING af Gate A's
  princip ("afgøres af unique_travel_dealstatus sammen med hs_is_closed/hs_is_closed_won") — ikke
  en ordret kopi af Marketing Dashboards fulde, ikke-fuldt-dokumenterede formel. Bør bekræftes
  eksplicit af Ricko eller en domæneansvarlig ved Gate B2/C, ikke kun antages.
- Ydeevne ved skala (dealstage-historik for ~2.600+ deals, hver dag) er ikke belastningstestet —
  Gate A's egen live-kørsel viste at én kørsel tager sekunder for dette datavolumen, men det bør
  bekræftes for den fulde, produktionsbundne sync i Gate C.
- Single-request-upsert-størrelsen (`persistence.upsertCohortRows`) er ikke testet mod PostgRESTs
  egne payload-/statement-grænser ved ~2.600 rækker i ét kald — bør verificeres i Gate C's
  dry-run, med sideopdeling som en fremtidig, dokumenteret forbedring hvis nødvendigt.
