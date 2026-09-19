# WORKING_MODE — arbejdsform for kapitler

Fast arbejdsform for agenter (Claude Code m.fl.) på dette projekt. Supplerer `AGENTS.md`; ved konflikt vinder
`AGENTS.md`s stop- og godkendelsesregler. Formålet er færre, større og mere færdige leverancer — ikke færre
sikkerhedsgates.

## 1. Et kapitel = ét resultat

- Ét kapitel har **ét primært bruger- eller forretningsresultat**, formuleret i issue'et som *"Resultat: …"*
  (fx "sælgeren kan se, hvilke rejseforslag der bør følges op").
- Kapitlet omfatter **analyse, implementering, tests, rettelser og aflevering** som én sammenhængende
  leverance — normalt én PR. En ren planlægningsleverance (docs-only) kan ligge på sin egen branch.

## 2. Sådan arbejdes der

- **Rutinemæssige tekniske valg inden for scope træffes selvstændigt** (filplacering, navngivning, intern
  struktur, hjælpefunktioner, testopsætning, refaktorering af de filer der alligevel ændres). Dokumentér kun
  valg der ændrer adfærd, sikkerhed eller arkitektur.
- **Arbejdet stopper ikke ved første delresultat.** En analyse, en første implementering eller en første
  grøn test er ikke afleveringen. Aflever, når acceptkriterierne er verificeret — eller ved en reel stopbetingelse.
- **Ingen gentagne tests uden ændringer eller en konkret uafklaret risiko.** Kør fuld suite når kode er ændret;
  docs-only ⇒ `git diff --check` (se `docs/TESTING.md`, "Testniveau efter ændringstype"). Genkør ikke identiske
  checks.
- **Ingen scope-udvidelse for at forlænge arbejdet.** Gode idéer uden for scope noteres som opfølgning i issue'et
  — de implementeres ikke.
- **Reviewfund behandles samlet.** Læs hele reviewet, ret alle fund i én runde, verificér, og svar én gang —
  ikke gennem mange små prompts.
- **Test adfærd og fejlveje, ikke antal.** Sikkerhedskritiske tests kontrolleres med en mutation (fjern
  kontrollen — testen skal fejle). Hvor en route-adapter ikke kan enhedstestes, kør den byggede app lokalt mod
  en read-only datakilde og verificér statuskoder og at intet skrives.

## 3. Særskilte godkendelser (uændrede)

Disse er aldrig en del af et kapitels løbende arbejde og kræver hver især Rickos eksplicitte godkendelse
(jf. `AGENTS.md` og `docs/ACCESS_MATRIX.md`):

- migration i production (filen må versioneres og verificeres lokalt; kørslen godkendes særskilt)
- merge til `main` (= production-deploy)
- aktivering af retention/`pg_cron`
- nye adgange/integrationer, destruktive handlinger, sletning af branches/stash/data
- syntetiske events eller ændringer i production-data

## 4. Stopbetingelser

Stop og dokumentér præcist ved: behov for ny adgang, uventet database-drift, destruktive handlinger, væsentligt
ændret produktscope, eller en fejl hvis årsag ikke kan afklares forsvarligt. **Ved en blocker:** færdiggør de
uafhængige dele af den autoriserede opgave, og rapportér blockeren med alvor og betydning.

## 5. Checkpoints

Ved meningsfulde milepæle (færdig PR-runde, migration kørt, review modtaget, sessionsskifte forestående) gemmes
et kort checkpoint i `docs/CHECKPOINT.md` (overskrives — det er ikke en log). Format:

```
Branch/HEAD:       <branch> @ <sha> (+ evt. PR-nummer)
Færdigt:           <kort>
Udestående:        <kort, inkl. hvem der ejer næste skridt>
Teststatus:        <kommandoer + faktiske resultater>
Næste handling:    <én konkret handling>
```

Et checkpoint er **ikke en anmodning om godkendelse** — det gør det muligt at fortsætte efter et sessionsskifte.
Operationel status (hvad er live) hører fortsat hjemme i `docs/STATUS.md`.

## 6. Model

Brug **Sonnet som standard**, hvor det er tilgængeligt. Brug kun en dyrere model ved konkret arkitektur- eller
sikkerhedskompleksitet, og forklar først hvorfor. Opfind ikke modelnavne, og påstå ikke modelskift som værktøjet
ikke understøtter.

## 7. Afleveringsrapport

Én samlet rapport pr. arbejdsrunde med:

1. PR-links og eksakte HEAD-SHA'er
2. resultater holdt op mod acceptkriterierne
3. hvad der er **verificeret**, og hvad der alene er **foreslået**
4. testkommandoer og faktiske resultater
5. CI/Vercel-status knyttet til den **korrekte HEAD**
6. åbne fejl og risici med alvor og betydning
7. konkrete beslutninger til Ricko
8. forslag til næste kapitel (som færdig, bestillingsklar opgave)

## 8. Offentligt repo

Repoet er offentligt. Ingen kundedata, secrets eller screenshots — og **ingen detaljer om aktive
sikkerhedssvagheder** i commits, docs eller PR-tekster. Sikkerhedsfund uden for kapitlets scope vurderes som
mulige afhængigheder eller registreres som separat opfølgning uden detaljer.
