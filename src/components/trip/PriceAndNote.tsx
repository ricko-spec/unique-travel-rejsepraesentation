import type { Trip } from "@/lib/types";
import { SectionHeader } from "./SectionHeader";

export function PriceAndNote({ trip }: { trip: Trip }) {
  return (
    <section>
      <SectionHeader label="Pris" />
      <div className="price-wrap">
        <div className="price">
          <div>
            <div className="price-label">Samlet pakkerejsepris</div>
            <div className="price-total">{trip.price.total}</div>
            <div className="price-per">{trip.price.perPerson}</div>
          </div>
          <div className="price-divider" />
          <div className="price-note">{trip.price.note}</div>
        </div>
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
