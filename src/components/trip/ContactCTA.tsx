import type { Trip } from "@/lib/types";
import { ContactIntentLink } from "./ContactIntentLink";

// Vision 3.0 Fase 3 (Issue #73): mailto-linket (email) og rådgiverens tel-link
// (phone) er stadig helt almindelige anchors — ContactIntentLink tilføjer kun
// en non-blocking klik-side-effect (ingen preventDefault, ingen await).
// Bookingnummeret indgår i mailto-SUBJECT (brugerens egen mailfunktion, som
// før) men sendes ALDRIG med tracking-requesten (body er kun { channel }).
export function ContactCTA({ trip }: { trip: Trip }) {
  // Graceful fallback: uden en matchet rådgiver-email skjuler vi hele blokken.
  if (!trip.advisorEmail) return null;

  const firstName = trip.advisor.split(" ")[0] || "os";
  const subject = encodeURIComponent(`Spørgsmål til rejse ${trip.bookingNo}`);
  const mailto = `mailto:${trip.advisorEmail}?subject=${subject}`;
  const telHref = trip.advisorPhone
    ? `tel:${trip.advisorPhone.replace(/[^\d+]/g, "")}`
    : null;

  return (
    <section id="kontakt">
      <div className="cta-wrap">
        <ContactIntentLink
          channel="email"
          className="cta"
          href={mailto}
          aria-label={`Kontakt ${trip.advisor} om rejsen`}
        >
          <div>
            <div className="cta-text-l">Spørgsmål til jeres rejse?</div>
            <div className="cta-text-s">Ring eller skriv direkte til {firstName}</div>
          </div>
          <div className="cta-arrow" aria-hidden="true">→</div>
        </ContactIntentLink>
        {telHref && (
          <div
            style={{
              marginTop: 12,
              textAlign: "center",
              fontSize: 14,
              color: "var(--grey-text)",
            }}
          >
            Eller ring direkte til{" "}
            <ContactIntentLink
              channel="phone"
              href={telHref}
              style={{ color: "var(--rainforest)", whiteSpace: "nowrap" }}
            >
              {trip.advisorPhone}
            </ContactIntentLink>
          </div>
        )}
      </div>
    </section>
  );
}
