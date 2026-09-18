// Vision 3.0 Fase 3 (Issue #73) — ren klient-beslutningslogik for
// kontakt-intent-tracking. Ingen React-/DOM-imports: fetch injiceres, så hele
// "hvad sker der ved et klik" kan unit-testes uden en browser
// (src/components/trip/ContactIntentLink.tsx er en ekstremt tynd wrapper).
//
// KONTRAKT — tracking er KUN en side-effect og må ALDRIG forstyrre den
// handling kunden prøver at udføre (åbne mail-/telefon-app'en):
//   - ingen preventDefault(), ingen await af serversvaret, ingen loading state,
//     ingen fejl-UI, ingen retry
//   - fetch er fire-and-forget med `keepalive: true`, fordi mailto:/tel:-
//     navigation kan ske umiddelbart efter klikket, og en keepalive-request
//     overlever selve navigationen
//   - ALT kan fejle (fetch mangler, kaster synkront, promise afvises) uden at
//     nogen exception når klik-handleren

import { shouldSendChannel, type ContactChannel } from "./contact-intent";

export type ContactIntentFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    credentials: "same-origin";
    keepalive: true;
  },
) => Promise<unknown>;

/** Endpointet ligger under kundens EGEN slug-path — adgangscookien er path-scoped. */
export function contactIntentUrl(slug: string): string {
  return `/${slug}/intent`;
}

/**
 * Registrerer at `channel` blev brugt. Returnerer true hvis en request blev
 * forsøgt (kun til tests/observability — kalderen bruger den ikke).
 *
 * Dedup: samme kanal højst én gang pr. page load (`sent` er en in-memory Set
 * ejet af ContactIntentProvider). Kanalen markeres som sendt FØR fetch — en
 * fejlet request retry'es aldrig. Kaster aldrig.
 */
export function trackContactIntent(input: {
  sent: Set<ContactChannel>;
  channel: ContactChannel;
  slug: string;
  fetchImpl?: ContactIntentFetch;
}): boolean {
  const { sent, channel, slug } = input;
  if (!shouldSendChannel(sent, channel)) return false;

  const fetchImpl =
    input.fetchImpl ??
    (typeof fetch === "function" ? (fetch as unknown as ContactIntentFetch) : undefined);
  if (!fetchImpl) return false;

  sent.add(channel);
  try {
    // BODY er udelukkende { channel } — aldrig trip_id, bookingnummer, slug,
    // eller andet. Serveren udleder trip'en fra URL-slug'en + adgangscookien.
    const request = fetchImpl(contactIntentUrl(slug), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel }),
      credentials: "same-origin",
      keepalive: true,
    });
    // Fire-and-forget: en afvist promise saniteres stille.
    Promise.resolve(request).catch(() => {});
  } catch {
    // Synkron fejl fra fetch — bevidst ignoreret. Kontakthandlingen må aldrig
    // kunne blive dårligere af tracking.
  }
  return true;
}
