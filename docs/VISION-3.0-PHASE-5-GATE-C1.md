# Vision 3.0 Fase 5 — Gate C1: HubSpot-stagekontrakt v3 og write-free dry-run

> [Issue #84](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/84), parent #80.
> Gate C1 er den **write-free** del af Gate C: live read-only stage-metadata, komplet
> stagekontrakt v3, den rigtige snævre HubSpot-adapter og én operatørstyret dry-run.
> Permanent aktivering (Vercel-secrets, singleton-seed, cron, `ACTIVE`, baseline-sync, Gate D)
> er **ikke** en del af C1.

## 1. Evidens

Live, read-only metadata for pipeline `754595640` ("Unique Travel", 18 stages, ingen arkiverede),
hentet af Ricko i eget PowerShell 2026-09-25 med `scripts/operator/Get-ConversionStageMetadata.ps1`
(SecureString, oprydning i `finally`). Kun metadata; intet token og ingen dealdata.

Property-metadata: `pipeline`/`dealstage` (enumeration), `unique_travel_bookingno` (string),
`unique_travel_dealstatus` (enumeration, 20 options inkl. `Solgt`, `Billetter sendt` og
`Solgt (andet booking nr.)`), `hs_is_closed` (bool, calculated), `hs_is_closed_won` (bool).

## 2. Stagekontrakt v3

Fire klasser (`src/lib/conversion/contract.ts`). Hver stage bærer desuden den live-metadata,
klassen er begrundet i: lukke-flag (= live `metadata.isClosed`), `label`, `displayOrder` og
`archived`. En deals `hs_is_closed` skal matche lukke-flaget, og den live stage-liste skal matche
kontrakten 1:1 på **id, isClosed, normaliseret label, displayOrder og archived**; pipelinen må ikke
være arkiveret. Enhver afvigelse — rename, reorder, (af)arkivering, ny/manglende/dubleret stage —
⇒ `CONTRACT_DRIFT` (fail-closed). Klassifikationen bygger nemlig på navn og placering (fx er Følg
op/Lav tilbud PRE_QUOTE, fordi de ligger før Tilbud sendt), så et stage-id alene er ikke nok
(Codex-review 5318246169).

- **Normaliseret label** = Unicode NFC, trim og sammenfoldet whitespace. Store/små bogstaver
  bevares bevidst — en ændring der er fail-closed og kræver en reviewet kontraktopdatering.
- **displayOrder** sammenlignes eksakt pr. stage (JSON-arrayets rækkefølge er uden betydning).
- Manglende eller ugyldig `label`/`displayOrder`/`archived` (pr. stage) eller `archived` (pipeline)
  i live-svaret ⇒ adapteren afviser svaret (`page-inconsistent`) — aldrig MATCH.
- Kontrakten valideres også internt: labels ikke-tomme og unikke, `displayOrder` unikke heltal ≥ 0.
- `CONTRACT_VERSION` forbliver 3: klassifikationen og stage-sættet er uændret, kun verifikationen
  er skærpet, og v3 er endnu ikke persisteret nogen steder (production-DB står på 2).

| Klasse | Første observation efter baseline | Ved baseline |
|---|---|---|
| `PRE_QUOTE` (åben) | `ELIGIBLE_PENDING` — optages ikke | `ELIGIBLE_PENDING` |
| `QUOTE_OR_LATER` | optages; kohortestart = observationen | `PRE_START_EXISTING` |
| `OUTCOME_WITHOUT_QUOTE_EVIDENCE` (åben eller lukket) | `EXCLUDED` (`CLOSED_BEFORE_QUALIFIED_OBSERVATION`) — optages aldrig | `PRE_START_EXISTING` |
| `CLOSED_NO_QUOTE` (lukket) | `ELIGIBLE_PENDING` — optages aldrig på denne stage | `PRE_START_EXISTING` |

v2's `CLOSED_AMBIGUOUS` kunne kun udtrykke lukkede stages og er erstattet af
`OUTCOME_WITHOUT_QUOTE_EVIDENCE`. `CLOSED_NO_QUOTE` er ny, fordi Screenet/Dubletter/Test Leads er
lukkede, men ikke dokumenterer et tilbud (den eksisterende `PRE_QUOTE` kræver åben stage).
Ingen DB-ændring er nødvendig: udfaldene bruger de eksisterende eligibility-/årsagskoder fra
migration 013 (årsagskoden `CLOSED_BEFORE_QUALIFIED_OBSERVATION` dækker nu også åbne
post-salg-stages).

| # | Stage-id | Label | isClosed | Klasse |
|---|---|---|---|---|
| 0 | 1098732865 | Lead (Aktive) | false | PRE_QUOTE |
| 1 | 1098732866 | Assigned | false | PRE_QUOTE |
| 2 | 1169086048 | Forsøgt kontaktet (1) | false | PRE_QUOTE |
| 3 | 1400145244 | Forsøgt kontaktet (2) | false | PRE_QUOTE |
| 4 | 1110279228 | Følg op | false | PRE_QUOTE |
| 5 | 1098732867 | Lav tilbud | false | PRE_QUOTE |
| 6 | 1098732868 | Tilbud sendt | false | QUOTE_OR_LATER |
| 7 | 1169407502 | Opdateret tilbud | false | QUOTE_OR_LATER |
| 8 | 1098732870 | Solgt | true | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 9 | 1419023367 | Solgt (I andet bookingnr.) | true | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 10 | 1407668785 | Billetter sendt | true | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 11 | 1354831680 | Afslag (Alle) | true | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 12 | 1386314544 | Screenet | true | CLOSED_NO_QUOTE |
| 13 | 1110279229 | På rejse | false | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 14 | 1110279231 | Hjemvendt | false | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 15 | 1110279230 | Aflyst rejse (Alle) | true | OUTCOME_WITHOUT_QUOTE_EVIDENCE |
| 16 | 1110279232 | Dubletter | true | CLOSED_NO_QUOTE |
| 17 | 1110279233 | Test Leads | true | CLOSED_NO_QUOTE |

`CONTRACT_VERSION = 3`, `complete: true`. **Production-DB'ens `contract_version`-default er
bevidst stadig 2** (ingen DB-ændring i C1), så enhver non-dry-run fejler lukket med
`CONTRACT_VERSION_MISMATCH`, indtil en senere, separat reviewet aktiveringsgate løfter versionen.

### Særskilt vurdering

- **Solgt / Solgt (I andet bookingnr.) / Billetter sendt:** lukkede udfald. En deal kan i
  princippet nå dem uden at have været observeret i "Tilbud sendt" (fx hvis den springer frem
  mellem to daglige syncs), så stagen beviser ikke et observeret tilbud ⇒
  `OUTCOME_WITHOUT_QUOTE_EVIDENCE`. En deal der allerede er optaget på "Tilbud sendt", forbliver
  optaget, når den senere når disse stages (terminal tilstand). BOOKED afgøres stadig kun af
  `unique_travel_dealstatus` ∈ {Solgt, Billetter sendt} — aldrig af stagen eller `hs_is_closed_won`.
- **Afslag (Alle):** lukket afslag, der kan ske både før og efter et tilbud ⇒
  `OUTCOME_WITHOUT_QUOTE_EVIDENCE`. Tabt/afvist registreres kun som datakvalitet.
- **Aflyst rejse (Alle):** lukket, efter salg ⇒ beviser ikke et observeret tilbud ⇒
  `OUTCOME_WITHOUT_QUOTE_EVIDENCE`.
- **På rejse / Hjemvendt:** **åbne** stages (`isClosed=false`) efter salg. Kunne ikke udtrykkes i
  v2 (CLOSED_AMBIGUOUS krævede lukket; QUOTE_OR_LATER ville optage en deal, der først ses her,
  med kohortestart = nu og en booking allerede registreret — en falsk konvertering). Derfor
  `OUTCOME_WITHOUT_QUOTE_EVIDENCE`: optages aldrig på disse stages alene.
- **Screenet / Dubletter / Test Leads:** lukkede uden tilbud ⇒ `CLOSED_NO_QUOTE`; optages aldrig
  på denne stage alene (pending efter baseline, PRE_START ved baseline).
- **Følg op (displayOrder 4) og Lav tilbud (5):** åbne og placeret **før** "Tilbud sendt" i
  pipelinen ⇒ `PRE_QUOTE`. Klassifikationen er konservativ: den kan aldrig optage en deal uden
  tilbud; i værste fald bliver en deal, der går "Tilbud sendt" → "Følg op" mellem to syncs, ikke
  optaget (kun dækning, aldrig forkert optagelse).

## 3. HubSpot-adapter — præcis API-grænse

`src/lib/conversion/hubspotLiveAdapter.ts`:

- Host nøjagtigt `https://api.hubapi.com`; hård allowlist på (metode, URL).
- `GET /crm/v3/pipelines/deals/754595640` — pipelinens `archived` samt pr. stage id, `label`,
  `displayOrder`, `archived` og `metadata.isClosed` (alle strengt parset; øvrige felter ignoreres).
- `POST /crm/objects/2026-09/deals/search` — HubSpots aktuelt dokumenterede, datoversionerede
  search (limit ≤ 200, maks. 10.000 resultater pr. query, heltals-`after`). Body: filter
  `pipeline EQ 754595640`, sortering `hs_object_id ASCENDING`, præcis properties `pipeline`,
  `dealstage`, `unique_travel_bookingno`, `unique_travel_dealstatus`, `hs_is_closed`,
  `hs_is_closed_won`. Ingen associations, historik, kontakter eller virksomheder; ingen
  query-parametre.
- Fejl: 401/403/429/5xx/netværk mappes kategorisk; andre 4xx og ugyldige svar ⇒
  `page-inconsistent`; `total` > 10.000 ⇒ `total-mismatch`. Ingen retry. ≥ 250 ms mellem
  requests (HubSpot: 5 search-req/s). Aldrig rå payloads, deal-id'er eller token i fejl/log.
- POST til search er en læseoperation; create/update/archive kan ikke nås.

## 4. Write-free operatør-dry-run

`src/lib/conversion/operatorDryRun.ts` + `scripts/operator/conversion-dry-run.ts` +
`scripts/operator/Invoke-ConversionDryRun.ps1` (lokalt; ikke en route):

- Secrets indtastes skjult (SecureString), lever kun i processen, ryddes i `finally`.
  `HUBSPOT_DEAL_KEY_SECRET` genereres i processen (32 tilfældige bytes) og vises/gemmes aldrig.
- Supabase-projekt låst til `iunixfpthdftmkgpugex`.
- To værn mod skrivning: motoren skriver aldrig i dry-run, og `beginSyncRun`/`commitSyncRun`/
  `failSyncRun` er erstattet af et værn, der kaster og tælles. Rækker i de tre tabeller tælles før
  og efter; enhver forskel eller ethvert skriveforsøg ⇒ `FAIL`.
- Output: kun aggregater; 1–9 vises som `<10` (booket også, hvis komplementet er 1–9).
- Før/efter-tællingen er **kategorisk**: fejler en optælling, rapporteres kun tabel + kategori,
  fx `precheck-fejl: conversion_sync_runs=AUTH`. Kategorier: `AUTH` (401 / PGRST30x — nøgle
  afvist, eller ikke en service-role-/secret-nøgle for projektet), `PERMISSION` (403 / 42501),
  `TABLE_NOT_FOUND` (404 / 42P01 / PGRST205 — inkl. postgrest-js' HEAD-omskrivning af tom 404
  til 204 uden count), `NETWORK` (fetch-fejl / status 0 / exception), `INVALID_RESPONSE` (alt
  andet, fx 5xx eller manglende/ugyldigt count). Udledes kun af status og fejlkode — aldrig af
  fejltekst; URL, headers, nøgler og rå DB-fejl forlader aldrig klassifikationen. Tællingen er
  HEAD med `count=exact` (ingen rækker hentes) og uden retry. Stadig fail-closed.

## 5. Dry-run-resultat

**Forsøg 1 (head `560fced`, 2026-09-25):** `VERDICT: FAIL (PRECHECK_FAILED)` · stage-kontrakt
`NOT_REACHED` · skriveforsøg 0 · exit 1. Fejlede sikkert i før-tællingen, før HubSpot blev kaldt.
Rickos uafhængige efterkontrol: state/cohort/runs 0/0/0, 14 migrationer, ingen cron — ingen
ændring. Værktøjet kasserede dengang al fejlinformation, så årsagen kunne ikke udledes uden en ny
kørsel; kodeanalysen viste, at en HEAD-fejl i postgrest-js kun bærer HTTP-status. Rettet
test-first med kategorisk diagnose pr. tabel (§4). Ingen live-kørsel foretaget af agenten.

**Forsøg 2 (head `e4490b1`, 2026-09-25): `VERDICT: PASS`, node exit code 0.**

| Måling | Resultat |
|---|---|
| stage-kontrakt | MATCH (18 stages, v3) |
| side-/total-konsistens | PASS |
| baseline-klassifikation | ja |
| observeret i alt | 2.652 |
| PRE_START_EXISTING | 2.489 |
| ELIGIBLE_PENDING | 163 |
| enrolled | 0 |
| booket (observeret udfald) | 788 |
| outcome-konflikter (data-health) | 28 |
| skriveforsøg | 0 |
| rækker før / efter (state/cohort/runs) | 0/0/0 / 0/0/0 — uændret: JA |

*Note:* forsøg 2 kørte før skærpelsen i §2 (Codex-review 5318246169) og verificerede derfor kun id
og lukke-flag live. Label, displayOrder og archived i kontrakten er taget direkte fra Rickos
live-metadata samme dag (Issue #84), så de matcher den observerede tilstand; den skærpede
verifikation køres live første gang ved næste godkendte kørsel. Ingen ny live-kørsel i C1.

**Nul-write-bevis (tre uafhængige kilder):** (1) værktøjets egne værn: 0 skriveforsøg og
uændrede rækketal før/efter; (2) ChatGPTs read-only efterkontrol af production: 0/0/0 rækker,
14 migrationer, ingen cron; (3) agentens read-only efter-snapshot via Supabase MCP med præcis
samme forespørgsel som pre-snapshottet: 0/0/0 rækker, 14 migrationer, intet `cron`-schema og
uændret skema-fingeraftryk `4f06ac47f147e646c7b75711ecfdd941`.

**De 788 bookede er baseline-observationer — ikke konverteringer i målingen.** Kørslen er en
baseline (målingen er ikke startet), og i en baseline optages ingen deal: alle eksisterende
deals klassificeres enten som `PRE_START_EXISTING` (allerede på tilbud-eller-senere/lukket stage
— terminal, indgår aldrig i kohorten) eller `ELIGIBLE_PENDING` (åben PRE_QUOTE-deal).
`enrolled = 0` er derfor forventet. "Booket" tæller blot, hvor mange observerede deals der på
observationstidspunktet har et BOOKED-udfaldssignal (dealstatus Solgt/Billetter sendt) — det er
historik fra før målingsstart og indgår hverken i tæller, nævner, trend eller publicerede tal.
Den fremadrettede kohorte består udelukkende af deals, der **efter** den officielle
målingsstart observeres i en QUOTE_OR_LATER-stage for første gang som ny eller
`ELIGIBLE_PENDING` deal (kohortestart = den sync'ens tidspunkt). De 163 `ELIGIBLE_PENDING` er
kandidater, ikke kohortemedlemmer.

**De 28 outcome-konflikter er data-health, ikke et måleresultat.** En outcome-konflikt betyder,
at de to udfaldskilder i HubSpot er uenige om samme deal: enten dealstatus Solgt/Billetter sendt
mens dealen er lukket-tabt, eller dealen er lukket-vundet mens dealstatus ikke er Solgt/Billetter
sendt. Motoren gætter ikke — konflikten registreres som tidspunkt og tælles kun aggregeret. Ingen
af de 28 er i en kohorte (enrolled = 0), så de påvirker ingen tal. Anbefalet opfølgning (ikke C1,
Rickos beslutning): en data-health-gennemgang i HubSpot af hvilken kilde der er korrekt. Ingen
deal-id'er, navne eller bookingnumre er udtrukket eller dokumenteret.

Rå output er ikke gemt; kun ovenstående sanitiserede aggregater.

## 6. Stadig ikke aktiveret

Ingen Vercel-secrets · ingen singleton-seed · ingen cron · ingen DB-write · ingen officiel
baseline-sync · ingen status `ACTIVE` · ingen Gate D · ingen merge. Production-DB'ens
`contract_version` er fortsat 2.

## 7. Rickos beslutninger før dry-run (2026-09-25) — implementeret

Begge tidligere åbne punkter er lukket som **efterfølgende udelukkelse** af en allerede optaget
deal (`postEnrollmentExclusionReason` + tidspunkt, samme mønster som bookingkonflikten): rækken
bevares som revisionsspor, den oprindelige observation (kohortestart, eksponering, bookingnøgle)
omskrives ikke, markeringen sættes én gang og fjernes aldrig (første årsag vinder), kun ENROLLED
kan markeres, og en markeret deal indgår **aldrig** i publicerede tal — hverken tæller, nævner,
gruppetotal, trend eller tabt/afvist. Den vises kun som small-cell-beskyttet datakvalitet.

1. **`unique_travel_dealstatus = "Solgt (andet booking nr.)"`** ⇒ udfaldssignalet er *uafklaret*
   (hverken BOOKED, NOT_BOOKED, tabt eller konflikt) og en optaget deal markeres
   `BOOKED_OTHER_REFERENCE_UNRESOLVED` — også hvis den optages med statussen allerede sat. Den må
   først tælle som BOOKED, når en senere, reviewet løsning sikkert forbinder den med det rigtige
   bookingnummer (ikke en del af C1).
2. **Optaget deal flyttes senere til Dubletter/Test Leads** (`invalidatesEnrollment` på de to
   stages i kontrakten) ⇒ markeres `INVALIDATED_DUPLICATE_OR_TEST`. Screenet, Afslag og Solgt
   ugyldiggør ikke. En pending deal i Dubletter/Test Leads forbliver pending.

**Persistens kræver migration 014 (ikke i C1):** production-skemaet (migration 013) har ingen
kolonner til markeringen, og C1 må ikke ændre databasen. Supabase-adapteren afviser derfor enhver
commit, der ville bære en markering (`COMMIT_REJECTED`), før noget sendes — fail-closed. Dry-run'en
påvirkes ikke (den skriver aldrig, og ved baseline kan ingen deal være optaget), og non-dry-run er
i forvejen blokeret af `contract_version` 2 ≠ 3. Migration 014 (kolonner + CHECK + frys-trigger)
er derfor en eksplicit forudsætning for aktiveringsgaten sammen med versionsløftet.
