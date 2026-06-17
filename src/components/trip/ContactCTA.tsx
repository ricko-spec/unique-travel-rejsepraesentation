import type { Trip } from "@/lib/types";

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
        <a className="cta" href={mailto} aria-label={`Kontakt ${trip.advisor} om rejsen`}>
          <div>
            <div className="cta-text-l">Spørgsmål til jeres rejse?</div>
            <div className="cta-text-s">Ring eller skriv direkte til {firstName}</div>
          </div>
          <div className="cta-arrow" aria-hidden="true">→</div>
        </a>
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
            <a href={telHref} style={{ color: "var(--rainforest)", whiteSpace: "nowrap" }}>
              {trip.advisorPhone}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
