import type { Trip } from "@/lib/types";

export function ContactCTA({ trip }: { trip: Trip }) {
  const firstName = trip.advisor.split(" ")[0] || "Ricko";
  return (
    <section id="kontakt">
      <div className="cta-wrap">
        <a className="cta" href="tel:+4559498630">
          <div>
            <div className="cta-text-l">Spørgsmål til jeres rejse?</div>
            <div className="cta-text-s">Ring eller skriv direkte til {firstName}</div>
          </div>
          <div className="cta-arrow">→</div>
        </a>
      </div>
    </section>
  );
}
