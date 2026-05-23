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
NEXT_PUBLIC_SUPABASE_URL=https://ocxrvkrggzppyhgyambj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PASSWORD=...
```

- Hent Supabase-nøgler i [Supabase dashboard](https://supabase.com/dashboard/project/ocxrvkrggzppyhgyambj/settings/api) → Project Settings → API.
- `ADMIN_PASSWORD` vælger du selv — det bruges på `/admin`.

### 3. Kør SQL-migrationen

Åbn [SQL Editor](https://supabase.com/dashboard/project/ocxrvkrggzppyhgyambj/sql/new) i Supabase og kør indholdet af `supabase/schema.sql`.

### 4. Start dev server

```bash
npm run dev
```

- `/admin` — log ind med `ADMIN_PASSWORD`, upload PDF, opret link.
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
    admin/api/auth            login/logout
    admin/api/parse           PDF → Claude → JSON
    admin/api/trips           CRUD
    layout.tsx                root layout + fonts
    globals.css               alle brandtokens + komponentstilarter
  components/trip/            kundesidens sektioner
  lib/
    types.ts                  Zod-schemas + Trip-typer
    claude.ts                 Anthropic-klient + systemprompt
    supabase/server.ts        Supabase-klient (service role)
    admin-auth.ts             cookie-baseret login
supabase/schema.sql           DB-skema
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
