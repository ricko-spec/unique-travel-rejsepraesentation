import type { Trip } from "@/lib/types";
import { SectionHeader } from "./SectionHeader";

export function PriceAndNote({ trip }: { trip: Trip }) {
  // 21 af 237 aktive rejser har tom price.total (verificeret i DB) — designets
  // tom-tilstand er derfor en reel case, ikke en teoretisk. price.note er i alle
  // disse tilfælde allerede udfyldt af parseren ("Pris ikke oplyst..." + evt.
  // rådgivernavn), så rådgiverhenvisningen i tom-tilstanden bruger eksisterende
  // data — der opfindes intet.
  const hasPrice = trip.price.total.trim().length > 0;

  return (
    <section id="pris">
      <SectionHeader label="Pris" />
      <div className="price-wrap">
        {hasPrice ? (
          <div className="price">
            <div>
              <div className="price-label">Samlet pakkerejsepris</div>
              <div className="price-total">{trip.price.total}</div>
              <div className="price-per">{trip.price.perPerson}</div>
            </div>
            <div className="price-divider" />
            <div className="price-note">{trip.price.note}</div>
          </div>
        ) : (
          <div className="price-empty">
            <div className="pe-line" />
            <div className="pe-text">Prisen fremsendes separat</div>
            {trip.price.note && <div className="pe-sub">{trip.price.note}</div>}
          </div>
        )}
      </div>

      {trip.practicalNote && (
        <div className="note-wrap">
          <div className="note">
            <strong>God at vide.</strong>
            {trip.practicalNote}
          </div>
        </div>
      )}
    </section>
  );
}
