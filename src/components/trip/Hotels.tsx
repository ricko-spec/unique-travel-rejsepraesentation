import type { Hotel } from "@/lib/types";
import { SectionHeader } from "./SectionHeader";

export function Hotels({ hotels }: { hotels: Hotel[] }) {
  return (
    <section className="hotels">
      <SectionHeader label="Jeres hoteller" />
      <div className="hotels-grid">
        {hotels.map((h, i) => (
          <div className="hotel" key={i}>
            <div className="hotel-head">
              <div>
                <div className="hotel-name">{h.name}</div>
                <div className="hotel-sub">{h.location}</div>
              </div>
              <div className="hotel-nights">
                <div className="hotel-nights-num">{h.nights}</div>
                <div className="hotel-nights-lbl">
                  {h.nights === 1 ? "nat" : "nætter"}
                </div>
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
            {h.roomAllocations && h.roomAllocations.length > 0 && (
              <div className="px-6 pb-5">
                <div className="text-xs uppercase tracking-wider text-rainforest/70 mb-2 font-medium">
                  Værelsesfordeling
                </div>
                <ul className="space-y-1">
                  {h.roomAllocations.map((alloc, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-grey-text border-l-2 border-gold/50 pl-3 py-1"
                    >
                      {alloc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {h.alternative && h.alternative.name && (
              <div className="mx-6 mb-5 mt-1 p-4 bg-sand-page/60 border border-sand rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gold mb-2 font-medium">
                  Dette resort kunne også være noget for jer
                </div>
                <div className="font-serif text-lg text-rainforest mb-1">
                  {h.alternative.name}
                </div>
                {h.alternative.description && (
                  <div className="text-sm text-grey-text mb-2">
                    {h.alternative.description}
                  </div>
                )}
                {(h.alternative.nights > 0 || h.alternative.meals) && (
                  <div className="text-xs text-grey-text">
                    {h.alternative.nights > 0 && `${h.alternative.nights} nætter`}
                    {h.alternative.nights > 0 && h.alternative.meals && " · "}
                    {h.alternative.meals}
                  </div>
                )}
                {h.alternative.savings && (
                  <div className="mt-2 text-sm text-rainforest font-medium">
                    Besparelse: {h.alternative.savings}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
