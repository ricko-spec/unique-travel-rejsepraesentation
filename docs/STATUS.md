# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-08-26** (efter august-batchen PR #5–#9 + fuldført branch-oprydning)

## Production

- **Commit:** `8d664dc` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk` svarer HTTP 200
  (`8d664dc` = docs-only STATUS-merge oven på app-koden fra PR #5–#9 / `9dfddbf`)
- Indhold ud over juli-batchen (sec-fixes, password-flow, destinations-upload m. WebP, opret-destination,
  AI Project Automation Kit):
  - **PR #6 (`fix/admin-password-recovery-flow`)** — password recovery for admin: reset-side,
    recovery-mail, sessionshåndtering + ærlig 429-besked ved Supabase mail-rate-limit.
  - **PR #7 (`fix/customer-access-and-multiple-hotel-alternatives`)** — flere alternative hoteller vises
    som separate cards (løftes fra `notes` i normalizer), ingen dobbelt "Besparelse: Besparelse …";
    adgangsgate/bookingnummer-unlock verificeret.
  - **PR #8 (`fix/customer-layout-logo-and-tour-description`)** — rundrejse-/programinklusioner ligger
    ikke længere som lang tekstblok på pakke-hotel-kortet; vises i rejseplanen som "Læs om udflugten".
    Header/logo bekræftet ens på tværs (ren tekst-wordmark, intet Q/palme — ingen ændring).
  - **PR #5 (`feat/backend-integrations-created-by-and-parse-failures`)** — `trips.created_by` sættes ved
    oprettelse (kun insert-grenen; re-upload rører den ikke) + parse-fejl logges i `parse_failures`
    dead-letter (`invalid_json` | `schema_mismatch` | `anthropic_error`). Production-smoke-testet 2026-08-26.
  - **PR #9 (`fix/customer-hero-image-selection`)** — kombi-destinationer ("Sri Lanka & Maldiverne" o.l.)
    får nu landets hero-billede via segment-match i rute-rækkefølge (`pickDestinationMatch`); enkelt-
    destinationer uændret; fallback bevaret. Production-verificeret 2026-08-26.

## Branches

Branch-oprydning **fuldført 2026-08-26**: alle merged branches (PR #5–#9, `dest-admin`,
`docs/*`, `rate-limit-unlock-security-fix`, `feature/redigerbar-intro` m.fl.) samt de
tilhørende scratchpad-/D-worktrees er slettet lokalt og på remote. `feat/backend-integrations-…`
blev force-slettet lokalt (kun gammel pre-rebase `30900d8`; indholdet er i main via `af0acb2`).
Kun WIP/aktive og stash-tilknyttede referencer består.

| Branch | Tilstand |
|---|---|
| `main` | = origin/main = `8d664dc` (production) |
| `fix/preserve-room-blocks` | **IKKE merged (WIP)** — åben PR #2. Worktree: `wt-room-blocks` |
| `docs/status-after-sebastian-fixes` | **IKKE merged (WIP)** — bevares |
| `feature/individuelle-logins-profiles` | Merged — bevares pga. tilknyttet `stash@{0}` (image-library WIP) |
| `gallery-upload-diagnose` (kun remote) | **IKKE merged** — bevares indtil afklaret |

Worktrees: `main` (Desktop) + `wt-room-blocks` (`fix/preserve-room-blocks`). Ingen D-worktrees tilbage.

## Åbne tråde

1. Mille: opret Japan/Kenya/Mauritius-lignende manglende destinationer + billeder i production (ren drift, ingen kode)
2. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt
3. `stash@{0}` "image-library WIP" — fredet, beslutning udestår
4. Branch-oprydning — **fuldført 2026-08-26** (kun WIP/aktive/stash-tilknyttede branches består)

## Backlog (fra august-review)

- **Yderligere kommentarer fra PDF** — flere hotel-/programnoter der i dag ikke fanges struktureret,
  kunne løftes til kundevendt visning (kræver afklaring af hvilke felter).
- **Vandflyver-tag** — dedikeret markør/ikon for vandflyver-transfers og bagagebegrænsninger
  (i dag kun fri-tekst i noter).
- **Favicon / Q-logo** — kundevendt header er ren tekst-wordmark; intet Q/palme-brandmark eller favicon.
  Kræver eksplicit brandbeslutning (KRÆVER RICKO) — ikke en bug.
- **Supabase custom SMTP** — recovery-/system-mails rammer Supabase' delte mail-rate-limit;
  custom SMTP-domæne fjerner 429'erne (drift-opgave).
- **"Læs om rundrejsen"-tekstlabel** — evt. tydeligere toggle-label for rundrejse-/programafsnittet
  i rejseplanen (mindre UX-polish).
- **`parse_failures` oprydning** — pg_cron-job der sletter rækker > 30 dage (jf. `supabase/README.md`)
  er endnu ikke sat op.
- **Pæn fejlbesked ved ugyldig PDF** — for ugyldig/tom PDF returneres Anthropics rå 400-tekst til
  sælgeren (kun billing-fejl har særbesked). Overvej en generisk dansk besked.

## Seneste checks (2026-08-26, main `8d664dc`)

typecheck ✅ · lint ✅ (0 fejl; 4 kendte img-warnings = PERF-3) · build ✅ ·
test ✅ (37 tests / 4 filer: format, hotel-alternatives, normalize-trip, destination-match) ·
DB sund (~172 trips, 15 destinationer). Production-smoke-test af PR #5 (created_by + parse_failures)
og production-verifikation af PR #9 (hero) gennemført 2026-08-26; alt testdata ryddet op igen.

## Kendte risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data
- **Vercel preview er bag Vercel Authentication (SSO)** — preview-URL'er kan ikke curles anonymt;
  render-verifikation sker lokalt (mod prod-DB) eller på production efter merge
- **Storage-bucket-config uden for drift-tjekket** (destinations: 50 MB + MIME-allowlist)
- Parse-routen har latent 4,5 MB-grænse på PDF'er (Vercel-body-limit; TravelWire-PDF'er er små i praksis)
- Repo er public — disciplin omkring secrets/kundedata er procesbåret, ikke teknisk håndhævet

## Næste anbefalede outcome

1. **Vision 2.0 scope-afklaring og plan** med Ricko — ingen kode endnu (planlægges som preview-branch før merge)
2. **Backlog-prioritering** — vælg næste kundevendte forbedring fra listen ovenfor
