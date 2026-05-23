# Handoff: Unique Travel — Online Rejsepræsentation

## Overview

A responsive customer-facing trip presentation page for **Unique Travel**, a Danish luxury travel agency that sells bespoke trips. Each customer receives a unique link and opens the page on their phone or computer to view their complete tailor-made itinerary.

The page contains, in order:

1. **Hero** — atmospheric photo background + trip headline
2. **Trip details strip** — departure / return / travellers / advisor
3. **Itinerary timeline** — chronological day-by-day plan with expandable cards
4. **Hotels** — one card per hotel with nights and room details
5. **Price** — total package price + per person
6. **Practical note** — important practical info
7. **Contact CTA** — gold contact card
8. **Footer** — wordmark + tagline
9. **Mobile sticky action bar** — Ring + Kontakt os buttons fixed at bottom (mobile only)

---

## About the Design Files

The files in `reference/` are **design references created in HTML** — a working prototype that demonstrates the intended look, feel, and behavior. They are **not production code to copy verbatim**.

The task is to recreate these designs in the target codebase using its established patterns, component library, and conventions. If no codebase exists yet, choose the most appropriate framework for a customer-facing marketing/content page (Next.js, Astro, Remix, or a server-rendered template language are all reasonable for SEO and link-sharing).

Files included:
- `reference/Rejsepræsentation.html` — entry HTML with all CSS in a single `<style>` block
- `reference/app.jsx` — React component tree and trip data (uses React 18 via UMD; will need to be ported to the project's React/JSX setup)

---

## Fidelity

**High-fidelity.** Exact colors, typography, spacing, border-radii and interaction states are specified below. Reproduce pixel-perfectly. Where exact values are not stated, follow the reference HTML/CSS.

---

## Design Tokens

### Colors

| Token | Hex | Usage |
|---|---|---|
| `rainforest` | `#004e50` | Hero photo overlay, hotel header bg, price section bg, details strip bg, dark CTA backgrounds, body brand text |
| `rainforest-deep` | `#003a3c` | Hover state for `rainforest` buttons |
| `sand` | `#e2dccd` | Text on `rainforest` backgrounds (hotel name, meta values, etc.) |
| `sand-page` | `#efeae0` | Page background (body) |
| `gold` | `#d3a75d` | Primary accent — price total, CTA pill, hotel nights number, kicker accents, contact-CTA bg |
| `gold-soft` | `#c79a4f` | Gold hover state, OBS icon bg, day-program labels |
| `black` | `#1a1a1a` | Primary body text |
| `grey-text` | `#5e5e5e` | Secondary text (timeline details, hotel field values) |
| `grey-light` | `#eeeeee` | Subtle separators, dividers between activity items |
| `rust` | `#b7583a` | Activity/tour-program color (timeline dot + type label only — spot color) |
| `teal-light` | `#7a9e9f` | Transfer color (timeline dot + type label only) |
| `white` | `#ffffff` | Card backgrounds, action bar bg |
| OBS-callout bg | `#fbf2dc` | Amber background for practical notes |
| OBS-callout border | `#ecd9a3` | Border for practical notes |
| OBS-callout text | `#5a4520` | Body text inside OBS callout |
| OBS-callout strong | `#3d2f17` | Title text inside OBS callout |

### Typography

Use Google Fonts:
```
Cormorant: ital,wght@0,400;0,500;0,600;1,400;1,500;1,600
Open Sans: wght@300;400;500;600
```

- **Cormorant** (serif, regular & italic) — destination titles, hotel names, prices, large display text. Italic conveys exclusivity and warmth; used for hotel names, kicker headers in inside-page sections, italicized meal lines, "Spørgsmål til jeres rejse?" CTA.
- **Open Sans** (sans-serif, weights 300/400/500/600) — all body text, metadata, labels, buttons, intro paragraphs.

Base font: Open Sans 300 / 1.5 line-height / `#1a1a1a` on `#efeae0`.

### Spacing & layout

- Page max width: `1180px` centered
- Horizontal padding by breakpoint: `28px` (mobile) → `56px` (≥760px) → `72px` (≥1024px)
- Section vertical rhythm: top padding `64px` (mobile) → `88px` (≥760px) → `112px` (≥1024px)
- Border radii: rounded pills `999px` (CTAs, info pills, chips, action bar buttons); cards `2px` (timeline, hotel cards); price section `4px`

### Breakpoints

- **Mobile:** default (< 760px)
- **Tablet/medium:** `≥ 760px`
- **Desktop:** `≥ 1024px`

The page is mobile-first. Hotel cards go from 1 column to 2 columns at desktop. Hero metadata grid goes from 2-up to 4-up at tablet.

---

## Screens / Views

There is one page, broken into sections. Each section is described in detail below.

### 1. Hero

**Purpose:** First impression. Sells the trip emotionally with a destination photo and headline.

**Layout:**
- Full-bleed section, `min-height: 640px` mobile → `720px` tablet → `780px` desktop
- Layered stack (back to front): fallback gradient → photo `<img>` → dark gradient overlay → content
- Content uses flexbox column inside `.hero-inner`; top bar flex-row, body pushed to bottom via `margin-top: auto`

**Background layers:**
- **Fallback gradient** (always present, behind photo) — a tropical-horizon gradient using `radial-gradient` + `linear-gradient` from `#002f30` through `#004e50` to `#0a6566` with warm hints. Visible if the photo fails to load.
- **Photo `<img>`** — `object-fit: cover`, fills the section. Default photo URL points to Unsplash; in production, this should be a configurable per-booking image (see "State & Data" below). On error, hide the `<img>` so the fallback gradient shows through.
- **Dark overlay** — `linear-gradient(180deg, rgba(0,30,31,0.30) 0%, rgba(0,47,48,0.40) 35%, rgba(0,59,60,0.65) 75%, rgba(0,50,50,0.85) 100%)`. Pointer-events: none. Critical for text legibility regardless of photo.

**Top bar** (flex row, space-between):
- Left: "Unique Travel" wordmark — Cormorant 500, 22px mobile / 26px tablet+, white
- Right: "Kontakt" outline pill — `border: 1px solid rgba(255,255,255,0.55)`, padding `9px 22px`, radius `999px`, 13px white, min-height 38px, hover `background: rgba(255,255,255,0.12); border-color: #fff;`

**Body** (pushed to bottom via `margin-top: auto`, with `padding-top: 56px` mobile / `80px` tablet+):
- **Kicker:** "REJSEFORSLAG" — Open Sans 400, 11px, `rgba(255,255,255,0.85)`, `letter-spacing: 0.32em`, uppercase, mb 14px
- **Title:** trip destination (e.g. "Malaysia") — Cormorant 500 (not italic), white, `clamp(54px, 11vw, 124px)`, `line-height: 1.0`, `letter-spacing: -0.01em`, mb 22px
- **Info pills** (flex wrap, gap 8px, mb 22px) — two pills:
  - 1: destination subtitle (e.g. "Kuala Lumpur · Borneo · Perhentian Islands")
  - 2: date range (e.g. "26. juni 2027 – 13. juli 2027")
  - Each: padding `8px 16px`, radius `999px`, `background: rgba(255,255,255,0.08)`, `border: 1px solid rgba(255,255,255,0.32)`, `backdrop-filter: blur(6px)`, 13px white
- **Intro paragraph** — Open Sans 300, 16px mobile / 17px tablet+, `rgba(255,255,255,0.92)`, `line-height: 1.6`, `max-width: 560px` mobile / `620px` tablet+, mb 28px. Personalized trip description, 2-3 lines.
- **Gold CTA pill** — "Kontakt os om rejsen →" with arrow. Inline-flex, gap 10px, `background: #d3a75d`, `color: #004e50`, padding `13px 26px`, radius `999px`, 14px Open Sans 500, min-height 44px. Hover: background `#c79a4f`, arrow translates 3px right (0.2s ease).

---

### 2. Trip Details Strip

**Purpose:** Practical metadata block immediately under the hero.

**Layout:**
- Full-bleed, `#004e50` background, `#e2dccd` text
- Padding: `28px 28px` mobile → `36px 56px` tablet → `40px 72px` desktop
- 4-field grid: 2 columns mobile (gap `22px 28px`) → 4 columns ≥760px (gap 32px)

**Fields** (each is a `label` + `value` pair):
- **Afrejse** → e.g. "26. juni 2027"
- **Hjemkomst** → e.g. "13. juli 2027"
- **Rejsende** → e.g. "2 voksne"
- **Rådgiver** → e.g. "Ricko B. · Booking #34415"

**Field styles:**
- Label: 10px Open Sans, `rgba(226,220,205,0.6)`, uppercase, `letter-spacing: 0.22em`, mb 6px
- Value: Open Sans 300, 16px, `#e2dccd`, `line-height: 1.3`

---

### 3. Section Header (reused)

Pattern used by Rejseplan / Jeres hoteller / Pris sections.

```
[ caps gold label ]——————————————————————————
```

- Flex row, gap 18px, padding `64px 28px 28px` → `88px 56px 36px` → `112px 72px 40px`
- Label: 11px Open Sans 400, `#d3a75d`, uppercase, `letter-spacing: 0.18em`
- Trailing hairline: `flex: 1; height: 1px; background: #d3a75d; opacity: 0.55`

---

### 4. Itinerary Timeline

**Purpose:** Day-by-day chronological plan, color-coded by activity type, with expandable detail cards.

**Layout:**
- Vertical timeline with a 1px hairline track on the left (color `rgba(0,78,80,0.18)`)
- Each item: a circular type-dot on the track + a white card to the right
- Track positioned by `padding-left: 42px` on `.tl-track`; dots absolutely positioned at `left: -42px; top: 22px`
- Cards: white bg, padding `20px 22px` mobile / `24px 28px` tablet+, radius 2px, shadow `0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,60,60,0.04)`, mb 22px

**Color coding (4 types):**

| Type | Color | Used on |
|---|---|---|
| Flight (`flight`) | `#004e50` (rainforest) | dot border + fill, type-label text |
| Hotel (`hotel`) | `#d3a75d` (gold) | dot border + fill, type-label text (uses `gold-soft` `#c79a4f` for text) |
| Transfer (`transfer`) | `#7a9e9f` (teal-light) | dot border + fill, type-label text |
| Activity / tour-program (`activity`) | `#b7583a` (rust) | dot border + fill, type-label text |

Dot construction:
- Outer: 22×22, white bg, 2px solid border in type-color, radius 50%
- Inner (`::after`): 8×8 dot, bg in type-color, radius 50%

**Card content** (vertical stack):
1. **Type label** — e.g. "FLY · DAG 1" — 10px, type-color, uppercase, `letter-spacing: 0.22em`, weight 500, mb 6px
2. **Title** — Cormorant 500 italic, 24px mobile / 28px tablet+, `#1a1a1a`, `line-height: 1.15`, mb 8px (e.g. "Copenhagen → Kuala Lumpur")
3. **Details** — Open Sans 300, 13px, `#5e5e5e`, `line-height: 1.55`, mb 14px (e.g. "Singapore Airlines SQ351 · Afg. 11:55 · Ank. 10:35 (+1)")
4. **Chips row** — flex wrap, gap 6px. Each chip: 1px solid `#004e50`, color `#004e50`, padding `5px 11px`, radius `999px`, 10.5px Open Sans 500, uppercase, `letter-spacing: 0.1em`, transparent bg
5. **OBS callout** (optional, when item has a practical note) — see below
6. **Toggle button** (optional, when item is expandable) — see below
7. **Expandable section** (optional) — see below

#### OBS callout (practical note)

Used for important practical info that should stand out from the body text — e.g. "Chaufføren venter med skilt", "Hotel henter på havnen", "Terminalskift i Singapore".

- Flex row, gap 12px, padding `12px 14px`, margin-top 14px
- Background `#fbf2dc`, border `1px solid #ecd9a3`, `border-left: 3px solid #c79a4f`, radius 2px
- Icon: 22×22 circle, `#c79a4f` bg, white "!" character (Cormorant 600 italic, 14px)
- Title: 10.5px uppercase, `letter-spacing: 0.14em`, weight 600, color `#3d2f17`, block, mb 2px
- Body: 13px, weight 400, color `#5a4520`, `line-height: 1.5`

#### Toggle button (expandable cards)

- Margin-top 18px, `background: #004e50`, `color: #d3a75d`, padding `13px 18px`, radius 1px, min-height 44px
- Label: uppercase, `letter-spacing: 0.22em`, 10.5px Open Sans 500
- Arrow icon (▾) — 12px, rotates 180° via CSS transition when expanded
- Hover: `background: #003a3c`
- Default label: "Læs dagsprogram" or "Se udflugtsmuligheder" depending on expand kind. When open: "Skjul"

#### Expandable content

Animated max-height transition (0 → 2000px, 0.45s cubic-bezier(0.22,0.61,0.36,1)).

Inner content separated from card body by 22px padding + top 1px solid `#eeeeee`.

Two expand kinds:

**a) `program` — multi-day program**
- A stack of `.day` blocks, each with:
  - Label (e.g. "Dag 1 — Sandakan & Sepilok") — 10.5px Open Sans 500, `#c79a4f`, uppercase, `letter-spacing: 0.2em`, mb 6px
  - Body text — 14px Open Sans 300, `#1a1a1a`, `line-height: 1.55`
  - Optional meal line — 13px italic, `#5e5e5e`, mt 4px
- Followed by an "Inkluderet" list:
  - Header: 10.5px gold-soft uppercase label
  - Items: 13.5px Open Sans 300, each with an 8px gold dash to the left (made with `::before` absolute pos)
  - Container has a 1px solid `#d3a75d` top border with a 32px gold underscore detail above it (via `::before`)

**b) `activities` — list of activity options**
- Each item: padded 14px top/bottom, separated by `1px solid #eeeeee`
- Title: Cormorant 500 italic, 19px, `#1a1a1a`, mb 4px
- Description: 13px Open Sans 300, `#5e5e5e`, `line-height: 1.55`

**Default expanded:** In the reference, the `Orangutang Search` card (type=activity, expandKind=program) is open by default to show users the expand pattern. This is opt-in per-card via a `defaultOpen` prop.

---

### 5. Hotels

**Purpose:** Quick scan of all hotels in the trip with check-in/out dates.

**Layout:**
- Grid: 1 column mobile, 2 columns ≥1024px, gap 20px → 24px
- Each card: white bg, radius 2px, shadow `0 8px 24px rgba(0,60,60,0.04)`, overflow hidden

**Card header** (flex row, space-between, gap 16px, padding `22px 24px`):
- Background `#004e50`, text `#e2dccd`
- Left: hotel name (Cormorant 500 italic, 24px, `#e2dccd`, `line-height: 1.15`, mb 6px) + location (10px uppercase, `letter-spacing: 0.22em`, `rgba(226,220,205,0.6)`)
- Right: nights count
  - Number (Cormorant 500, 44px, `#d3a75d`, `line-height: 1`)
  - "nætter" (or "nat" if 1) label (10px uppercase, `letter-spacing: 0.22em`, `#d3a75d`, mt 4px)

**Card body** (padding `22px 24px 26px`, grid 2cols, gap `18px 24px`):
- Four fields: **Værelse**, **Måltider**, **Check-in**, **Check-ud**
- Label: 10px Open Sans, `#5e5e5e`, uppercase, `letter-spacing: 0.18em`, mb 5px
- Value: 14px Open Sans 300, `#1a1a1a`, `line-height: 1.4`

---

### 6. Price

**Purpose:** Show the package price clearly.

**Layout:**
- Inside section-wrap (matches page padding)
- `background: #004e50`, color `#e2dccd`, radius 4px
- Padding `36px 28px` mobile, centered text → padding `56px 48px` tablet+, grid `1fr auto` with items end-aligned, gap 32px, left-aligned
- The note spans full width below the price on tablet+ (`grid-column: 1 / -1`) with a top border `1px solid rgba(211,167,93,0.3)` and `padding-top: 28px`

**Content:**
- **Label** — "SAMLET PAKKEREJSEPRIS" — 11px Open Sans, `rgba(226,220,205,0.6)`, uppercase, `letter-spacing: 0.28em`, mb 16px
- **Price total** — e.g. "83.045 kr." — Cormorant 500, `clamp(40px, 8vw, 64px)`, `#d3a75d`, `line-height: 1`, `letter-spacing: -0.01em`, mb 12px
- **Price per person** — e.g. "41.523 kr. pr. person · 2 voksne" — Open Sans 300, 15px, `rgba(226,220,205,0.75)`
- On mobile only, a `1px` gold divider (opacity 0.45) sits between price and note (`margin: 24px 0`); hidden ≥760px
- **Note** — Open Sans 300, 12px, `rgba(226,220,205,0.7)`, `line-height: 1.6`. e.g. "Inkluderer fly, alle transfers, hotel og program som beskrevet. Rejseforsikring og visum ikke inkluderet."

---

### 7. Practical Note

**Purpose:** Important practical reminders (passport validity, vaccination, where details live).

**Layout:**
- Inside section-wrap, mt 24px
- `background: rgba(255,255,255,0.55)`, `border-left: 2px solid #d3a75d`, padding `18px 22px`, no radius
- Body: 13.5px Open Sans 300, `#1a1a1a`, `line-height: 1.6`
- Strong: Cormorant 500 italic, 16px, `#004e50`, displayed as a block heading inside the note

---

### 8. Contact CTA

**Purpose:** Final prompt to reach out to the advisor.

**Layout:**
- Inside section-wrap, mt 24px, has `id="kontakt"` (links to it from hero buttons)
- `background: #d3a75d`, padding 28px, radius 4px, min-height 88px
- Flex row, space-between, gap 24px

**Content:**
- Left:
  - "Spørgsmål til jeres rejse?" — Cormorant 500 italic, 22px mobile / 26px tablet+, `#004e50`, `line-height: 1.2`, mb 4px
  - "Ring eller skriv direkte til Ricko" — 12px Open Sans 500, `#004e50`, uppercase, `letter-spacing: 0.12em`, opacity 0.85
- Right: arrow icon — 52×52 circle, `1px solid #004e50`, transparent bg, "→" (22px, `#004e50`)
- Hover: bg `#c79a4f`, arrow translates 4px right (0.2s ease)

---

### 9. Footer

- Padding `72px 28px 56px` → `96px 56px 72px`, centered
- Wordmark: "UNIQUE TRAVEL" — Cormorant 500, 12px, `#004e50`, uppercase, `letter-spacing: 0.42em`, mb 8px
- Line: 11px Open Sans, `#5e5e5e`, uppercase, `letter-spacing: 0.14em` — e.g. "Skræddersyede rejser · København"

---

### 10. Sticky Action Bar (mobile only)

**Purpose:** Always-accessible contact buttons on mobile.

**Visibility:** displayed only when viewport width is `< 760px`. Hidden via `display: none` on ≥760px.

**Layout:**
- `position: fixed; bottom: 0; left: 0; right: 0; z-index: 50`
- `background: rgba(255,255,255,0.96)`, `backdrop-filter: blur(10px)`, `border-top: 1px solid #eeeeee`
- Padding: `12px 16px`, plus `env(safe-area-inset-bottom, 0px)` on the bottom for iOS notch safety
- Flex row, gap 10px

**Buttons:** Each flex:1, inline-flex centered, padding `14px 16px`, radius `999px`, 14px Open Sans 500, min-height 48px:
- "Ring" — outline. Color `#004e50`, border `1px solid rgba(0,78,80,0.55)`, transparent bg. Links to `tel:+4570260051` (advisor's number).
- "Kontakt os" — solid. Bg `#004e50`, color `#fff`. Links to `#kontakt`.

**Body offset:** Add `padding-bottom: 80px` to `body` when `< 760px` so the bar doesn't cover the final CTA.

---

## Interactions & Behavior

### Expand/collapse cards

- Click toggle button → state flips
- Animated via CSS max-height transition (0 ↔ 2000px, 0.45s cubic-bezier(0.22,0.61,0.36,1))
- Arrow icon rotates 180° on open
- Button label swaps between "Læs dagsprogram" / "Se udflugtsmuligheder" → "Skjul"
- `aria-expanded` attribute toggles with state
- Use proper React state per item (each item has its own `open` boolean)

### Hover states

- Hero Kontakt outline button: bg `rgba(255,255,255,0.12)`, border `#fff`
- Hero gold CTA: bg `#c79a4f`, arrow translates 3px right
- Timeline toggle button: bg `#003a3c`
- Contact CTA card: bg `#c79a4f`, arrow translates 4px right
- All transitions 0.2s ease

### Anchor scrolling

- "Kontakt" buttons (hero outline + hero gold CTA + sticky bar) all use `href="#kontakt"` which scrolls to the Contact CTA section. Use `scroll-behavior: smooth` on `html` (or a custom JS smooth-scroll handler in the target framework — **not** `scrollIntoView` which can disrupt the page).

### Photo fallback

- The hero `<img>` has an `onError` handler that hides the image (`display: none`), revealing the fallback gradient. Implement defensively — never let a broken image URL break the page.

---

## State Management

The reference is essentially a static-data page, but in production each customer's page is unique. A clean separation:

### Trip data (per booking)

A single typed object loaded by booking ID (`#34415` etc.):

```ts
type Trip = {
  bookingNo: string;
  destination: string;             // "Malaysia"
  subtitle: string;                // "Kuala Lumpur · Borneo · Perhentian Islands"
  departure: string;               // ISO or localized — "26. juni 2027"
  return: string;
  travellers: string;              // "2 voksne"
  advisor: { name: string; phone: string; };
  heroPhoto: string;               // URL to a Unsplash / customer-supplied image
  intro: string;                   // 2-3 line personalised description
  itinerary: ItineraryItem[];
  hotels: Hotel[];
  price: { total: string; perPerson: string; note: string; };
  practicalNote: string;
};

type ItineraryItem = {
  id: number;
  type: "flight" | "hotel" | "transfer" | "activity";
  typeLabel: string;               // "FLY · DAG 1"
  title: string;
  details: string;
  chips?: string[];
  obs?: { title: string; text: string; };
  expandKind?: "program" | "activities";
  expand?: ProgramExpand | ActivitiesExpand;
};

type ProgramExpand = {
  days: { label: string; text: string; meal?: string; }[];
  included: string[];
};

type ActivitiesExpand = {
  activities: { title: string; desc: string; }[];
};

type Hotel = {
  name: string;
  location: string;
  nights: number;
  room: string;
  meals: string;
  checkIn: string;
  checkOut: string;
};
```

### Local component state

- Each timeline item: `open: boolean` for its expand state. One card may be initialized `open: true` via a `defaultOpen` prop or a flag on the item itself.

### Loading & error states

- Initial page load: skeleton or spinner before trip data resolves.
- Invalid booking link: show a friendly error with "Kontakt os" link to the support address.
- Broken hero image: graceful fallback (handled by the gradient layer + `onError` on the img).

---

## Assets

### Photos

The reference uses Unsplash CDN URLs as the hero photo placeholder. In production:

1. The advisor uploads (or selects from a curated library) a hero image per booking — beach, jungle, ocean, mountain, etc. Match the trip's defining destination.
2. Store the chosen URL on the trip record.
3. Recommended minimum dimensions: 2400px wide, 16:9 or wider. Compressed JPEG at q≈80 is fine.
4. Default fallback when the image fails: the CSS gradient described in the Hero section.

The reference defaults to: `https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=2400&q=80&auto=format&fit=crop` (sunset beach). This file lives at `reference/app.jsx` line `const HERO_PHOTO = …`.

### Fonts

Self-host the two Google Fonts in production for performance and GDPR:
- Cormorant — ital,wght@0,400;0,500;0,600;1,400;1,500;1,600
- Open Sans — wght@300;400;500;600

### Icons

No icon library used. The few icons in the design are typographic:
- "→" arrow (literal character, in CTAs)
- "▾" arrow (literal character, toggle button)
- "!" exclamation (literal character, OBS callout, rendered in Cormorant italic for a serif feel)

If your codebase uses an icon set (Lucide, Heroicons, etc.), feel free to substitute equivalents — but the typographic versions are intentional and look good.

---

## Responsive behavior

| Element | Mobile (<760px) | Tablet (760–1023px) | Desktop (≥1024px) |
|---|---|---|---|
| Page horizontal padding | 28px | 56px | 72px |
| Hero min-height | 640px | 720px | 780px |
| Hero title | clamp 54px | clamp 11vw | clamp up to 124px |
| Trip details grid | 2 cols | 4 cols | 4 cols |
| Hotels grid | 1 col | 1 col | 2 cols |
| Price section | centered, stacked | left-aligned, side-by-side | left-aligned, side-by-side |
| Contact CTA title | 22px | 26px | 26px |
| Sticky action bar | visible | hidden | hidden |
| Body padding-bottom | 80px (clearance) | 0 | 0 |

No horizontal scroll at any width. Test at 320px, 375px, 768px, 1024px, 1440px.

---

## Files

- `reference/Rejsepræsentation.html` — full HTML with all CSS in a single `<style>` block, plus script tags for React/Babel/ImageSlot loading
- `reference/app.jsx` — React tree + trip data; covers Hero / TripDetails / Timeline / Hotels / Price / CTA / Footer / ActionBar

Open `Rejsepræsentation.html` in a browser to see the working reference.

---

## Notes for the implementer

- **Brand voice:** Minimalist, exclusive, not catalog-style. Generous whitespace. Gold is an accent, never dominant. The sand page background gives calm and elegance.
- **Tone:** Danish, formal-but-warm (de/jer rather than du). All copy in the reference is reusable.
- **Print-friendliness:** Nice-to-have. The page should also produce a reasonable PDF if a customer prints (hide the sticky action bar in print).
- **SEO:** Not critical — each page is behind a unique link. But set proper `<title>` per booking and a robots noindex.
- **Accessibility:** Use semantic landmarks (`<header>` for hero top, `<main>` for content, `<footer>`). All toggles need `aria-expanded`. Color contrast on `#d3a75d` over `#004e50` is borderline — keep text on gold-bg dark teal `#004e50` (not white), as the reference does.
