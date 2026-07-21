# PRODUCT — Unique Travel Rejsepræsentation

Kort produktbeskrivelse. Teknisk dybde: `docs/SYSTEM-ARKITEKTUR.md`.

## Hvem er det til

- **Primært:** Unique Travels sælgere (7 aktive) — de opretter og sender præsentationer
- **Sekundært:** Mille — vedligeholder det fælles destinationsbillede-bibliotek
- **Slutmodtager:** kunderne — familier/grupper der har fået et rejseforslag eller en bekræftet rejse

## Problemet det løser

Sælgere sendte statiske TravelWire-PDF'er på mail. Kunden fik et tungt, gråt dokument uden
brand-oplevelse. Nu får kunden et personligt, kode-låst link til en levende, brandet præsentation —
og sælgeren bruger under et minut på at lave den.

## Vigtigste brugerflows

1. **Sælger opretter præsentation:** log ind på `/admin` → træk TravelWire-PDF ind → Claude parser
   (20-40 sek.) → justér evt. kundenavn/hero → Opret → kopiér færdig mail-tekst (link + adgangskode).
2. **Kunde ser rejsen:** åbner `/{slug}` → indtaster booking-nr som kode → hero, dag-for-dag-tidslinje,
   hoteller, pris, kontakt-CTA direkte til egen rådgiver.
3. **Sælger justerer intro:** `/admin/trips/{id}` → redigér AI-introen inden for brand-reglerne →
   "Gendan AI-tekst" kan altid rulle tilbage.
4. **Mille vedligeholder billeder:** `/admin` → Destinationsbilleder → opret evt. destination →
   upload originalfoto (op til 50 MB) → systemet beskærer og konverterer automatisk.

## Hvad produktet IKKE er

- Ikke et booking- eller betalingssystem — præsentation og kontakt, intet salg i appen
- Ikke en kundeportal med login/historik — ét link pr. rejse, kode-låst
- Ikke et CMS — indholdet kommer fra TravelWire-PDF'en + destinationsbiblioteket
- Ikke offentligt indekserbart — alt er noindex, kundesider er kode-låste

## Produktprincipper (gældende)

- **Brand før features:** eksklusiv, rolig, dansk. Cormorant/Open Sans, rainforest/guld/sand.
  Intro-stilen er ENS for alle sælgere (strategisk beslutning — se `docs/DECISIONS.md`).
- **Fail-soft:** manglende billede → gradient; ingen rådgiver-match → CTA skjules;
  intet må vælte kundens side.
- **Sælgeren blokeres aldrig unødigt:** bløde advarsler frem for hårde stop (fx intro-editoren).
- **Minimal kundefriktion:** ét link, én kode, ingen konto.

## Vision 2.0

Planlagt som **næste visuelle løft** af kundepræsentationen — **ikke implementeret, ikke påbegyndt**.
Referencemateriale ligger i `Brandfarver og præsentationsside-design/v2-redesign/` (uden for repoet).
Kendt hensigt: bl.a. galleri-forbedringer (galleriet skjuler sig allerede automatisk ved 0 billeder;
en tærskel-regel er triviel at tilføje). **Scope og indhold: KRÆVER RICKO** — planen skal laves som
preview-branch før merge (se `docs/DECISIONS.md` og `docs/ROADMAP.md`).
