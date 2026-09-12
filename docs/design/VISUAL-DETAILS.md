# Visuelle detaljer

De præcise værdier der skal rammes. Alt herunder er hentet direkte fra `code/styles.css`.

---

## Farver

| Token | HEX | Brug |
|---|---|---|
| `--rainforest` | `#004e50` | Hero-overlay, info-strip, hotelheader, pris, mørke knapper |
| `--rainforest-deep` | `#003a3c` | Hover på mørke knapper |
| `--sand` | `#e2dccd` | Tekst på mørke flader |
| `--sand-page` | `#efeae0` | Sidens baggrund |
| `--gold` | `#d3a75d` | Accent: CTA, pris, nætter-tal, dekorlinjer, chevron |
| `--gold-soft` | `#c79a4f` | Guld-hover, OBS-ikon, dagsprogram-labels, flynummer |
| `--black` | `#1a1a1a` | Brødtekst |
| `--grey-text` | `#5e5e5e` | Sekundær tekst |
| `--grey-light` | `#eeeeee` | Separatorer |
| `--rust` | `#b7583a` | Aktivitet/turprogram — **kun** timeline-prik + label + "+1" i tider |
| `--teal-light` | `#7a9e9f` | Transfer — **kun** timeline-prik + label |
| OBS-boks | bg `#fbf2dc` → `#faf0d6`, kant `#ecd9a3`, venstrekant `#c79a4f` | |
| OBS-tekst | `#5a4520`, titel `#3d2f17` | |

Sidens baggrund har et varmt radialt højlys i toppen:
`radial-gradient(120% 60% at 50% -10%, #f4f0e7, transparent 60%)` over `--sand-page`.

## Fonte

- **Cormorant** 400/500/600 + kursiv — destinationstitel, kort- og hotelnavne, pris,
  dag-labels, flynummer, kursive detaljer
- **Open Sans** 300/400/500/600 — brødtekst, labels, metadata, knapper, tider

## Fontstørrelser

| Element | Størrelse | Vægt / stil |
|---|---|---|
| Hero-titel | `clamp(54px, 11vw, 124px)` | Cormorant 500, `line-height: 1.0`, `letter-spacing: -0.018em` |
| Hero wordmark | 22px mobil / 26px tablet+ | Cormorant 500, hvid |
| Hero kicker | 11,5px | Open Sans, `letter-spacing: 0.4em`, uppercase |
| Hero info-pills | 13px | Open Sans 400 |
| Hero intro — lead | 19px mobil / 22px desktop | Open Sans 300, hvid |
| Hero intro — rest | 16px mobil / 17px tablet+ | Open Sans 300, `rgba(255,255,255,.92)` |
| Hero CTA | 14px | Open Sans 500 |
| Info-strip label | 10px | uppercase, `letter-spacing: 0.22em`, `rgba(226,220,205,.6)` |
| Info-strip værdi | 16px | Open Sans 300, sand |
| Sektions-label | 11,5px | `letter-spacing: 0.34em`, uppercase, guld, vægt 500 |
| Sektions-total (højre) | 9,5px | uppercase, `letter-spacing: 0.2em`, grå |
| Dag-skillelinje label | 17px | Cormorant 600 kursiv, rainforest |
| Dag-skillelinje dato | 9,5px | uppercase, `letter-spacing: 0.22em`, `rgba(0,78,80,.45)` |
| Kort type-label | 10px | uppercase, `letter-spacing: 0.26em`, vægt 500, typefarve |
| Kort titel | 26px mobil / 30px tablet+ | Cormorant 500 kursiv |
| Kort detaljer | 13,5px | Open Sans 300, grå |
| Chips | 10px | uppercase, `letter-spacing: 0.12em`, vægt 500 |
| Foldeknap | 10,5px | uppercase, `letter-spacing: 0.18em`, vægt 500 |
| Flytider | 17px | Open Sans 400 |
| Lufthavnskoder | 10px | vægt 600, `letter-spacing: 0.16em`, rainforest |
| Flytabel label | 9,5px | uppercase, `letter-spacing: 0.2em`, vægt 500, grå |
| Flytabel værdi | 13,5px | Open Sans 300, rainforest |
| Hotelnavn | 26px | Cormorant 500 kursiv, sand |
| Hotel nætter-tal | 48px | Cormorant 500, guld |
| Prisbeløb | `clamp(40px, 8vw, 64px)` | Cormorant 500, guld, `letter-spacing: -0.01em` |
| CTA-overskrift | 22px mobil / 26px tablet+ | Cormorant 500 kursiv, rainforest |
| Footer wordmark | 12px | Cormorant 500, `letter-spacing: 0.42em`, uppercase |

**Minimum:** ingen tekst under 9,5px.

## Spacing

- **Sidepadding:** `28px` → `56px` (≥760px) → `72px` (≥1024px)
- **Sektionsrytme (top):** `64px` → `88px` → `112px`
- **Kort indre padding:** 26px/28px mobil → 30px/34px tablet+
- **Timeline:** spor rykket ind `42px`; prikker på `left: -40px`
- **Kort-afstand:** 18px mellem timeline-elementer; 20–24px i hotel/galleri-grid
- **Sidens max-bredde:** 1180px, centreret
- **Touch-mål:** minimum 44px
- Layout bygges med **flex/grid + `gap`** — ikke marginer på enkelt-elementer

## Form og skygger

- **Radius:** kort 16px (`--card-radius`) · OBS-boks og note 12px · piller 999px
- **Skygge, hvile:** `0 1px 2px rgba(0,60,60,.04), 0 20px 44px -26px rgba(0,50,50,.32)`
- **Skygge, hover:** `0 1px 2px rgba(0,60,60,.05), 0 30px 56px -28px rgba(0,50,50,.40)`
- **Hover-løft:** `translateY(-2px)` på timeline- og hotelkort
- **Easing:** `cubic-bezier(0.22, 0.61, 0.36, 1)` (`--ease-lux`)

---

## De enkelte detaljer

### Guldstreg ved "REJSEFORSLAG"
Kickeren har en **30px vandret guldstreg foran teksten**, sat med `::before`,
1px høj, farve `--gold`, 14px gap til teksten. Teksten selv er 11,5px,
`letter-spacing: 0.4em`, uppercase, `rgba(255,255,255,.85)`.
Streg + tekst sidder i en `inline-flex` med `align-items: center`.

### Hero info-pills
To pills under titlen: rute og datointerval.
- `background: rgba(255,255,255,.10)`
- `border: 1px solid rgba(255,255,255,.28)`
- `backdrop-filter: blur(6px)` — glas-effekten er en del af udtrykket
- `border-radius: 999px`, padding `9px 18px`, 13px hvid, `letter-spacing: 0.02em`
- Ligger i `display: flex` med `gap: 8px` og `flex-wrap: wrap`

### Hero intro (to niveauer)
Ét afsnit, to spans:
- `.lead` — 19px mobil / 22px desktop, **ren hvid**, `line-height: 1.5`, 8px under
- `.rest` — 16/17px, `rgba(255,255,255,.92)`, `line-height: 1.6`
- `max-width: 560px` mobil / `620px` tablet+ — må ikke løbe bredere

### Hero CTA
Guld **pille**, ikke firkant.
- `background: #d3a75d`, `color: #004e50`, `border-radius: 999px`
- padding `15px 30px`, 14px Open Sans 500, `letter-spacing: 0.04em`, min-højde 44px
- **Guldglød:** `box-shadow: 0 12px 30px -10px rgba(211,167,93,.6)`
- Hover: `background: #c79a4f`, `translateY(-1px)`, pilen glider 3px til højre

### Hero foto og overlay
- Fotoet fylder hele hero'en med `object-fit: cover`
- **Overlay (kritisk for læsbarhed):**
  `linear-gradient(180deg, rgba(0,30,31,.30) 0%, rgba(0,47,48,.40) 35%, rgba(0,59,60,.65) 75%, rgba(0,50,50,.85) 100%)`
- Titlen har `text-shadow: 0 2px 40px rgba(0,30,30,.25)`
- **Ken Burns:** 26s, `scale(1)` → `scale(1.075)` + `translate3d(0,-1%,0)`,
  `transform-origin: 55% 45%`, `ease-out`, kører én gang
- Hero min-højde: 640px → 720px (≥760px) → 780px (≥1024px)
- Indholdet ligger i en flex-column og skubbes mod bunden med `margin-top: auto`

### Info-strip (nederst i hero-området)
Egen sektion **under** hero, ikke inde i den.
- `background: #004e50`, tekst `#e2dccd`
- padding `28px` → `36px 56px` → `40px 72px`
- Grid: **2 kolonner mobil** (gap `22px 28px`) → **4 kolonner ≥760px** (gap 32px)
- Fire felter: Afrejse / Hjemkomst / Rejsende / Rådgiver (+ bookingnr. i samme felt)
- Label over værdi; label 10px caps halvtransparent, værdi 16px Open Sans 300

### Timeline
- Lodret 1px spor der **fader ud i begge ender**:
  `linear-gradient(180deg, transparent 0%, rgba(0,78,80,.20) 8%, rgba(0,78,80,.20) 92%, transparent 100%)`
- Prikker: 18px, `1.5px` kant i typefarven, 7px fyldt kerne,
  **halo** `box-shadow: 0 0 0 5px var(--sand-page)` så sporet læses rent bagved
- Farvekodning gælder **både prik og type-label**:
  fly `#004e50` · hotel `#c79a4f` (label) / `#d3a75d` (prik) · transfer `#7a9e9f` · aktivitet `#b7583a`

### Dag-skillelinje
Guldprik (5px, med 4px sand-halo) på sporet + "Dag N" i Cormorant kursiv +
dato i små caps + en linje der fader ud:
`linear-gradient(90deg, rgba(0,78,80,.16), transparent)`

### Chips
Delikate outline-piller — må ikke blive tunge.
- `border: 1px solid rgba(0,78,80,.28)`, tekst `#004e50`
- meget svag fyld `rgba(0,78,80,.015)`, `border-radius: 999px`
- padding `6px 13px`, `white-space: nowrap` (må ikke brydes over to linjer)
- Hover: kant → `rgba(0,78,80,.4)`, fyld → `rgba(0,78,80,.05)`

### OBS-boks
- `background: linear-gradient(180deg, #fcf5e2, #faf0d6)`
- `border: 1px solid #ecd9a3`, `border-left: 3px solid #c79a4f`, radius 12px
- Ikon: 22px cirkel i `--gold-soft` med hvidt "!" i Cormorant 600 kursiv
- Titel: 10,5px caps `letter-spacing: 0.14em` vægt 600 `#3d2f17`, som blok
- Tekst: 13px vægt 400 `#5a4520`

### Foldeknap
**Rund pille** — ikke en firkantet mørk blok.
- Hvile: transparent, `1px solid rgba(0,78,80,.35)`, tekst `#004e50`, radius 999px,
  padding `12px 24px`, min-højde 44px
- **Chevron (▾) i guld** `#d3a75d`, 11px, roterer 180° når åben
- Hover og åben tilstand: fyldes `#004e50`, tekst bliver sand `#e2dccd`
- Labels: "Se flydetaljer" / "Læs dagsprogram" / "Se udflugtsmuligheder" → "Skjul"

### Flydetaljer (fold-ud)
To dele:
1. **Rute-diagram** — afgangstid (17px) / kode (10px caps) / by (11px) til venstre,
   1px linje med pilespids og flynummeret under i midten, ankomst højrestillet.
   `+1` vises i `--rust` som superscript hvis ankomst er næste dag.
2. **Teknisk tabel** — rækker med 1px `#eeeeee` skillelinje. Label 132px kolonne
   ved ≥560px, ellers stakket. Felter: Flynummer, Selskab, Afgang, Ankomst,
   Varighed, Klasse, Bagage, Mellemlanding (sidste kun hvis sat).

### Hotelkort
- Header `#004e50`: navn (Cormorant kursiv sand) + lokation (10px caps halvtransparent)
  til venstre, stort guld nætter-tal (48px) + "nætter" til højre
- Body hvid, 2-kolonne grid: Værelse / Måltider / Check-in / Check-ud
- Grid: 1 kolonne → **2 kolonner ved ≥1024px**

### Galleri
3 fliser i `aspect-ratio: 4/3`, radius 16px, 1 → **3 kolonner ved ≥760px**.
Billedtekst nederst i Cormorant kursiv 19px hvid over
`linear-gradient(180deg, transparent, rgba(0,30,30,.6))`, `pointer-events: none`.

### Priskort
Radius 16px. Mobil: centreret og stakket. ≥760px: `grid 1fr auto`, venstrestillet,
noten spænder fuld bredde med guld topkant `rgba(211,167,93,.3)`.

**Tom tilstand:** centreret, 40px guldstreg (`margin: 0 auto 18px`),
"Prisen fremsendes separat" i Cormorant kursiv `clamp(24px,4vw,32px)` hvid,
derunder rådgiverhenvisning 13px `rgba(226,220,205,.7)`.

### Kontakt-CTA
Guld baggrund, radius 16px, min-højde 88px, `glød: 0 24px 50px -28px rgba(211,167,93,.7)`.
Pil i 52px cirkel med 1px rainforest kant. Hover: `translateY(-2px)`, pil 4px til højre.

### Progress-nav (desktop ≥1180px)
Fixed i højre side, vertikalt centreret. Pr. sektion en 14px streg + skjult label.
Aktiv: farve `--gold-soft`, stregen vokser til 30px, labelen vises.
Labels folder ud for alle ved hover på hele nav'en. Klik = blød scroll.

### Mobil sticky bar (< 760px)
Fixed i bunden, `rgba(255,255,255,.96)` + `backdrop-filter: blur(10px)`,
1px topkant, radius `18px 18px 0 0`, padding `12px 16px` +
`env(safe-area-inset-bottom)`. To piller, `flex: 1`, min-højde 48px:
"Ring" (outline rainforest) og "Kontakt os" (fyldt rainforest, hvid tekst).
`body` får `padding-bottom: 80px` under 760px så baren ikke dækker CTA'en.

### Papir-tekstur
`body::before`, fixed, SVG `feTurbulence` fractalNoise `baseFrequency 0.8`,
**opacity 0.035**, `pointer-events: none`. Trækker udtrykket mod tryksag.
`.page` ligger på `z-index: 1` ovenover.

### Scroll-reveal
Base `opacity: 0; translateY(22px)` → `.in` `opacity: 1; translateY(0)`,
`0.8s var(--ease-lux)`. IntersectionObserver, threshold `0.12`,
`rootMargin: 0px 0px -8% 0px`, klassen sættes én gang og elementet unobserves.
Stagger ~90ms pr. indeks i galleri og hotelgrid.
**Skal slukkes ved `prefers-reduced-motion: reduce`** (tving `opacity:1; transform:none`).

## Breakpoints

| | Mobil < 760px | Tablet ≥ 760px | Desktop ≥ 1024px |
|---|---|---|---|
| Sidepadding | 28px | 56px | 72px |
| Hero min-højde | 640px | 720px | 780px |
| Info-strip | 2 kolonner | 4 kolonner | 4 kolonner |
| Galleri | 1 kolonne | 3 kolonner | 3 kolonner |
| Hoteller | 1 kolonne | 1 kolonne | 2 kolonner |
| Pris | centreret, stakket | venstre, side om side | venstre, side om side |
| Flytabel | stakket | 132px label-kolonne (≥560px) | 132px label-kolonne |
| Sticky bar | synlig | skjult | skjult |
| Progress-nav | skjult | skjult | synlig ≥ 1180px |

Ingen vandret scroll ved nogen bredde. Test 320 / 375 / 768 / 1024 / 1440px.

## Print

`styles.css` har et komplet `@media print`-afsnit: hero bliver fladt og bleget
(foto/overlay skjult, titel i rainforest 54pt), alle fold-ud åbnes, nav/knapper/
galleri skjules, og kort får `break-inside: avoid`. Behold det.
