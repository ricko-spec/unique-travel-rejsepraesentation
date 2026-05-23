import type { Hotel } from "@/lib/types";
import { SectionHeader } from "./SectionHeader";

export function Hotels({ hotels }: { hotels: Hotel[] }) {
  if (!hotels || hotels.length === 0) return null;
  return (
    <section>
      <SectionHeader label="Jeres hoteller" />
      <div className="hotels">
        {hotels.map((h, i) => (
          <div className="hotel" key={i}>
            <div className="hotel-head">
              <div>
                <div className="hotel-name">{h.name}</div>
                <div className="hotel-loc">{h.location}</div>
              </div>
              <div className="hotel-nights">
                <div className="hotel-nights-num">{h.nights}</div>
                <div className="hotel-nights-lbl">{h.nights === 1 ? "nat" : "nætter"}</div>
              </div>
            </div>
            <div className="hotel-body">
              <div>
                <div className="hotel-field-label">Værelse</div>
                <div className="hotel-field-value">{h.room}</div>
              </div>
              <div>
                <div className="hotel-field-label">Måltider</div>
                <div className="hotel-field-value">{h.meals}</div>
              </div>
              <div>
                <div className="hotel-field-label">Check-in</div>
                <div className="hotel-field-value">{h.checkIn}</div>
              </div>
              <div>
                <div className="hotel-field-label">Check-ud</div>
                <div className="hotel-field-value">{h.checkOut}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
