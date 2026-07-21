# ARCHITECTURE — kort overblik

Dette er landkortet. Den dybe reference (alle routes, tabeller, RLS, kode-uddrag, DDL) er
**`docs/SYSTEM-ARKITEKTUR.md`** — duplikér ikke herfra, henvis dertil.

## Stack og dataflow

```
Sælger ─► Next.js 14 (Vercel) ─► Claude API (claude-sonnet-4-6: PDF → JSON)
                │
                └─► Supabase (Postgres + Auth + Storage, projekt iunixfpthdftmkgpugex)
                        ▲
Kunde ─► /{slug} ───────┘   (service-role server-side; RLS lukker alt andet)
```

- **Hosting:** Vercel, auto-deploy ved push til `main` → `rejseplaner.uniquetravel.dk`.
  Preview pr. branch (bag Vercel Auth, deler production-DB/-Storage).
- **Al dataadgang er server-side** med service-role-nøglen (`src/lib/supabase/server.ts`);
  anon-nøglen bruges kun til auth-cookies. RLS: ingen direkte klient-adgang.

## Admin-flow (sælger)

`/admin` (Supabase Auth, individuelle logins) → PDF-upload → `POST /admin/api/parse`
(Claude, to parallelle kald: strukturJSON + råtekst) → Zod-validering + `normalizeTrip` +
advisor-berigelse → preview → `POST /admin/api/trips` (upsert på booking_no; slug genereres af DB).
Detalje-side `/admin/trips/{id}` med intro-editor (optimistisk lås → 409). QA-side, profil-side
(inkl. password-skift), destinationsbilleder. → SYSTEM-ARKITEKTUR §4-§7.

## Kunde-flow

`/{slug}` (force-dynamic, noindex) → cookie-tjek → `AccessGate` + `unlockTrip` server action
(rate-limit → kode-tjek → httpOnly-cookie, 30 dage) → præsentationen renderes med Zod-validering +
normalisering ved hver visning. Fallbacks: hero → rejsens foto → destinationens → gradient;
galleri skjules ved 0 billeder; CTA skjules uden advisor-match. → SYSTEM-ARKITEKTUR §4, §6.

## Destinationsbillede-flow (Mille)

Opret destination i admin → 3-trins upload: (1) `POST .../upload-url` udsteder signeret Storage-URL
til `_staging/` (random token), (2) browseren PUT'er originalen (op til 50 MB) **direkte til Supabase
Storage** — Vercel afviser bodies > 4,5 MB, derfor udenom — (3) `POST .../finalize-upload` henter,
magic-byte-tjekker, sharp-beskærer til WebP (hero 1920×1080 / galleri 1200×800), sletter staging og
opdaterer destinations-rækken. → SYSTEM-ARKITEKTUR §5.

## Auth, rate-limit, audit

- **Auth:** Supabase Auth (invite-only) + `@supabase/ssr`-cookies; middleware kun på `/admin*`;
  `getSessionUser()` gater alle admin-sider/-routes. Kunder: path-scoped unlock-cookie.
- **Rate-limit:** én mekanisme (`increment_rate_limit`-RPC, atomar, fail-open), tre nøgler:
  `unlock:{ip}:{slug}`, `login:{ip}`, `pwchange:{ip}` — alle 10 forsøg / 15 min. → §12.
- **Audit:** central `src/lib/audit.ts`, typed actions, best-effort. Intro logges som fingerprints
  (aldrig fuld tekst); passwords logges aldrig. → §13.

## Migrations og drift-check

Hele DB-skemaet er versioneret som idempotente `supabase/001-008_*.sql` (= live-DDL).
`node scripts/check-schema-drift.mjs` diffner live-DB mod `supabase/schema-baseline.json`
(exit 1 ved drift). Regel: ny DDL = ny fil + `--update-baseline` i samme ombæring.
**Kendt blind vinkel:** Storage-bucket-config (`storage`-skemaet) dækkes ikke. → `supabase/README.md`, §8.
