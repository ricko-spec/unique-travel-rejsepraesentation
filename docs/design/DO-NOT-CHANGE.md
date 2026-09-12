# Hvad du ikke må ændre eller selv opfinde

---

## 1. Må ikke ændres — brandet og udtrykket

**Farver.** Kun paletten i `VISUAL-DETAILS.md`. Ingen nye farver, ingen justerede
nuancer, ingen ekstra accentfarve. Guld er accent — det må ikke blive dominerende.
`--rust` og `--teal-light` bruges **kun** til timeline-prik og type-label.

**Fonte.** Cormorant + Open Sans. Overskrifter er serif. Skift ikke til en
system-stak eller Inter/Roboto fordi det er nemmere.

**Hero-opbygningen.** Foto + mørk gradient-overlay. Ikke en flad farveflade, ikke
et lyst hero, ikke et foto uden overlay (teksten skal være læsbar uanset billede).

**Foldeknapperne er runde piller** med guld chevron. Ikke firkantede mørke blokke.

**Kort-radius 16px** og de lagdelte, diskrete skygger. Ikke skarpe hjørner, ikke
hårde drop-shadows.

**Whitespace-niveauet.** Luften mellem sektionerne er en feature. Komprimér ikke
layoutet til dashboard-tæthed fordi "der er plads".

**Info-strippen er sin egen sektion under hero** — flyt den ikke ind i hero'en
eller ned i footeren.

**Glas-effekten på hero-pills** (`backdrop-filter: blur(6px)`) er en del af udtrykket.

## 2. Må ikke opfindes — indhold

**Ingen opdigtede rejsedata.** Skriv ikke hotelbeskrivelser, dagsprogrammer,
udflugtstekster, bagageregler eller OBS-noter der ikke står i det rigtige
rejseforslag. Mangler feltet → udelad det.

**Ingen erstatnings-billeder.** Sæt ikke stock-fotos ind fordi en booking mangler
et hero-foto. Brug gradient-fallbacken.

**Ingen opfundne priser.** Mangler prisen → brug "pris på forespørgsel"-tilstanden.

**Ingen opfundne telefonnumre.** Numrene i prototypen er placeholders.

**Ingen ny markedsføringstekst.** Tilføj ikke salgstekst, badges, "book nu",
rabat-sprog eller "populært valg". Intro-teksten skrives af rådgiveren.

## 3. Må ikke røres — systemet

- **Admin** — ingen ændringer
- **PDF-upload** — ingen ændringer
- **Database / skema** — ingen migrationer, ingen nye tabeller til dette
- **Auth** — ingen ændringer
- **Unlock-flowet** — præsentationen er read-only indhold *bag* det eksisterende
  flow. Byg ikke et nyt adgangs-flow.
- **Ingen writes.** Siden læser data, den skriver ikke.

## 4. Må ikke med i produktion — prototype-værktøjer

- `code/tweaks-panel.jsx` samt alt `useTweaks` og `<TweaksPanel>` — review-værktøj
- `code/image-slot.js` — placeholder; erstat med rigtige `<img>`
- `TWEAK_DEFAULTS`-objektet — brug værdierne som faste defaults, men behold ikke
  toggle-mekanikken
- CDN-scripts (React UMD, Babel standalone) — brug app'ens egen build

## 5. Faste designvalg — skal ikke gøres konfigurerbare

```
Knapstil:    rund pille (outline, guld chevron)
Kort-radius: 16px
Bevægelse:   til, men altid bag prefers-reduced-motion
Guld-accent: #d3a75d
Galleri:     vist når der er billeder — ellers udeladt helt
Pris:        vist når den findes — ellers "på forespørgsel"
```

De to sidste er **data-betingede**, ikke brugerindstillinger.

## 6. Udtryk designet ikke må glide over i

| Ikke | Betyder konkret |
|---|---|
| **SaaS-agtigt** | Ingen tætte kort-grids, ingen kølige gråtoner, ingen dashboard-tæthed, ingen statistik-widgets |
| **Katalogagtigt** | Ingen gittervæg af produkter eller priser, ingen "flere rejser som denne" |
| **For hyggeligt** | Ingen emoji, ingen håndtegnede illustrationer, ingen legende farver |
| **For salgsagtigt** | Ingen badges, tællere, urgency, rabatter eller CTA-spam |
| **Datatungt** | Ingen felter der kræver data TravelWire ikke har |

## 7. Ting jeg bevidst har holdt ude — tilføj dem ikke

- **Rutekort** — var bygget, men taget ud efter aftale
- **Ikoner i timeline-prikkerne** — de rene prikker er stærkere
- **Rådgiver-portræt** i kontakt-CTA'en — droppet
- **Standardvilkår** om annullering, forsikring og indrejse — bliver i PDF'en
- **Individuelle linjepriser**
- **Links til eksterne sider**

## 8. Tilgængelighed — skal med

- Semantiske landmarks: `<header>`, `<main>`, `<footer>`
- `aria-expanded` på alle foldeknapper
- Tekst på guld baggrund holdes i mørk teal `#004e50` — **ikke hvid** (kontrast)
- Al entré-animation slukkes ved `prefers-reduced-motion: reduce`
- Touch-mål minimum 44px
- Brug **ikke** `scrollIntoView` til progress-nav — beregn offset og brug
  `window.scrollTo({ behavior: "smooth" })` som prototypen gør

## 9. Hvis du er i tvivl

Spørg i stedet for at gætte. Det gælder især: hvilke felter TravelWire faktisk
leverer, hvor hero-fotos skal komme fra, og om galleriet skal med i første version
(anbefaling: nej).
