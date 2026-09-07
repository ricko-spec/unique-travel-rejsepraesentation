// Fritekst-søgning i admin-listen over rejsepræsentationer. Ren funktion uden
// React eller data-adgang, så den kan unit-testes. Filtreringen sker client-side:
// GET /admin/api/trips henter hele listen uden pagination, så hele datasættet er
// allerede i browseren — ingen server-søgning og ingen DB-ændring nødvendig.

// Kun de listefelter admin faktisk får udleveret. Rådgiver indgår ikke, fordi
// feltet ikke findes på listeelementet (det ligger i trip.data på detalje-siden).
export type SearchableTrip = {
  booking_no: string;
  destination: string;
  customer_name: string | null;
  slug: string;
};

// Søgeordet deles i ord, så "bali 356" og "sri lanka" begge virker. '#' fjernes,
// så både "35685" og "#35685" matcher bookingnummeret som det står i tabellen.
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/#/g, "").trim())
    .filter(Boolean);
}

function haystack(trip: SearchableTrip): string {
  return [trip.booking_no, trip.destination, trip.customer_name ?? "", trip.slug]
    .join(" ")
    .toLowerCase();
}

// Sandt når søgefeltet indeholder noget der faktisk filtrerer. Bruges af UI'et,
// så "aktiv søgning" og filtreringen altid er enige — også for input som "#",
// der ser udfyldt ud, men ikke giver nogen søgeord.
export function hasSearchQuery(query: string): boolean {
  return tokenize(query).length > 0;
}

// Sandt når ALLE søgeord findes i mindst ét af de søgbare felter. Delvise
// bookingnumre matcher, fordi der sammenlignes med substring.
export function matchesTripSearch(trip: SearchableTrip, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const hay = haystack(trip);
  return tokens.every((t) => hay.includes(t));
}

// Tom/whitespace-søgning returnerer listen uændret, så dashboardet opfører sig
// præcis som før når feltet er tomt.
export function filterTrips<T extends SearchableTrip>(trips: T[], query: string): T[] {
  if (tokenize(query).length === 0) return trips;
  return trips.filter((t) => matchesTripSearch(t, query));
}
