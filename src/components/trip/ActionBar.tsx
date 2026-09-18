import { ContactIntentLink } from "./ContactIntentLink";

export function ActionBar({ hasContact }: { hasContact: boolean }) {
  return (
    <div className="action-bar">
      {/* Vision 3.0 Fase 3 (Issue #73): "Ring" er et FAKTISK tel:-link og
          registreres som kontakt-intent (channel=phone) — stadig et helt
          almindeligt anchor, tracking er kun en non-blocking klik-side-effect. */}
      <ContactIntentLink channel="phone" className="action-ring" href="tel:+4559498630">
        Ring
      </ContactIntentLink>
      {/* ContactCTA renderer intet uden trip.advisorEmail, og id="kontakt"
          findes derfor ikke — uden dette tjek pegede knappen på et dødt anker.
          BEVIDST et almindeligt <a> og IKKE en ContactIntentLink: "Kontakt os"
          er ren intern navigation (#kontakt) og er ALDRIG kontakt-intent. Når
          kunden når sektionen, har Fase 2 allerede registreret "kontakt set" —
          SET og KLIKKET holdes helt adskilt (Issue #73). */}
      {hasContact && (
        <a className="action-contact" href="#kontakt">
          Kontakt os
        </a>
      )}
    </div>
  );
}
