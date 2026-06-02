# Unique Travel — Rejsepræsentation

Next.js 14 webapp der konverterer TravelWire PDF-rejseplaner til kunde-vendte præsentationer med unikke links.

## Setup

### 1. Installér dependencies

```bash
npm install
```

### 2. Opret `.env.local`

Kopiér `.env.example` til `.env.local` og udfyld:

```env
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://iunixfpthdftmkgpugex.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

- Hent Supabase-nøgler i [Supabase dashboard](https://supabase.com/dashboard/project/iunixfpthdftmkgpugex/settings/api) → Project Settings → API.
- Adgang til `/admin` styres af individuelle Supabase Auth-logins (email + password) — ikke en delt kode. Opret medarbejdere i Supabase → Authentication → Add user; en `profiles`-række oprettes automatisk.

### 3. Kør SQL-migrationerne

Åbn [SQL Editor](https://supabase.com/dashboard/project/iunixfpthdftmkgpugex/sql/new) i Supabase og kør `supabase/schema.sql` (trips) og `supabase/profiles.sql` (profiles + auth).

### 4. Start dev server

```bash
npm run dev
```

- `/admin` — log ind med din email + adgangskode, upload PDF, opret link. `/admin/profil` — rediger eget navn, telefon og rådgivernavn.
- `/[slug]` — den genererede kundeside (slug = booking-nr).

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind + CSS custom properties til brandtokens (`globals.css`)
- Supabase (`@supabase/supabase-js` med service role nøgle server-side; RLS låser direkte client-adgang)
- Anthropic Claude (`claude-sonnet-4-20250514`) til PDF-parsing
- next/font/google self-hoster Cormorant + Open Sans (GDPR)
- Zod til schema-validering

## Struktur

```
src/
  app/
    [bookingId]/page.tsx      kundens præsentationsside
    [bookingId]/loading.tsx   skeleton mens data henter
    [bookingId]/not-found.tsx fejlside ved ugyldigt link
    admin/page.tsx            login + dashboard
    admin/profil/page.tsx     profil-redigeringsside (eget navn/telefon/rådgivernavn)
    admin/api/auth            login/logout (Supabase Auth)
    admin/api/profile         egen profil (GET/PATCH)
    admin/api/parse           PDF → Claude → JSON
    admin/api/trips           CRUD
    layout.tsx                root layout + fonts
    globals.css               alle brandtokens + komponentstilarter
  components/trip/            kundesidens sektioner
  lib/
    types.ts                  Zod-schemas + Trip-typer
    claude.ts                 Anthropic-klient + systemprompt
    supabase/server.ts        Supabase-klient (service role) til data
    supabase/auth.ts          session-klient (@supabase/ssr) + getSessionUser
    profiles.ts               profil-opslag/-opdatering (RLS self-only)
  middleware.ts               holder Supabase-session frisk på /admin
supabase/schema.sql           trips-skema
supabase/profiles.sql         profiles + auth (RLS, triggers)
reference/                    designreferencer (uændret)
```

## Deployment (Vercel)

1. Push til Git-repo.
2. Importér i Vercel.
3. Tilføj samme miljøvariabler i Vercel project settings.
4. Deploy.

## Noter

- Kundesider er marker `noindex` og fetches dynamisk pr. request (`force-dynamic`).
- Service role-nøglen bruges kun server-side. RLS på `trips` betyder at anon-clients ikke kan ramme tabellen direkte.
- Deaktivering = soft delete (`active = false`); rækken slettes ikke.
- Sticky action bar skjules ved print og ved viewports ≥ 760px.
