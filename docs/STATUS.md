# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-16**

## Nu

- **Production:** Vision 2.0 fase 1-3 live. Aktuel main/deploy verificeres i GitHub/Vercel
  (denne fil hardcoder bevidst ikke en SHA — den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Aktivt kapitel:** [Issue #38](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/38)
  — Brugsoverblik / 100% upload-tracking. **PR åben, IKKE merget, migration IKKE kørt live** —
  afventer Rickos godkendelse. Se release-rækkefølgen i PR-beskrivelsen: migration 009 SKAL
  køres i production FØR kode-deploy (parse-routen fail-closed'er uden `upload_events`-tabellen).

## Seneste 3 relevante ændringer

1. **[PR #37](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/37) —
   Vision 2.0 fase 5 (pris/CTA/mobil-polish), 2026-09-15.** `.price`/`.cta`-radius 16px,
   `.note`-radius 12px, CTA-guldglød, `.action-bar`-topradius. Ny tom-pris-tilstand ud fra
   eksisterende `price.note`-data (21 af 237 aktive rejser har tom `price.total`). CTA skjules
   fortsat korrekt uden `advisorEmail`. **Sidste Vision 2.0-fase.**
2. **[PR #35](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/35) —
   Vision 2.0 fase 4 (billeder), 2026-09-15.** `DestinationGallery` ind i designkontrakten
   (1180px-bredde, 28/56/72px padding, 20/24px gap, 16px radius, 4:3-fliser, 1→3 kolonner
   fra 760px); hero-foto (LCP/priority) og hero-logo på `next/image`. Kundevendte
   `no-img-element`-warnings 0.
3. **[PR #33](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/33) —
   projekt-refresh (Issue #30), 2026-09-15.** Docs/process only: `STATUS.md` kortet fra
   582 til ~50 linjer, GitHub (issues/PR'er) er nu backlog- og historik-sandheden i stedet
   for en ekstern Cowork-fil, flere stale udsagn rettet (test-suite, Vision 2.0-status,
   slug vs. bookingnummer). Ingen produktkode ændret.

Fuld historik: [lukkede/merged PR'er på GitHub](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls?q=is%3Apr+is%3Amerged).

## Åbne beslutninger / risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data.
- **Vercel preview er bag Vercel Authentication (SSO)** — render-verifikation sker lokalt
  (mod prod-DB) eller på production efter merge.
- **Storage bucket-config uden for drift-tjekket** (kendt blind vinkel).
- Repo er public — secrets/kundedata-disciplin er procesbåret, ikke teknisk håndhævet.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**Afvent Rickos review af Issue #38-PR'en.** Ved godkendelse, i denne rækkefølge: (1) kør
migration `supabase/009_upload_events.sql` live + `node scripts/check-schema-drift.mjs
--update-baseline`, (2) verificér migrationen i production, (3) merge/deploy koden,
(4) kontrolleret test-upload gennem UI, (5) verificér at event + `/admin/brug` stemmer.
Herefter: intet automatisk næste kapitel — Vision 2.0 var det planlagte produktkapitel.
Afvent Rickos prioritering af næste backlogpunkt (`docs/ROADMAP.md`).
