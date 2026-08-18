import { type Hotel, formatLongDateDK } from "@/lib/types";
import { formatAlternativePriceLine, displayRoomLabel } from "@/lib/format";
import { SectionHeader } from "./SectionHeader";

export function Hotels({ hotels }: { hotels: Hotel[] }) {
  return (
    <section className="hotels">
      <SectionHeader label="Jeres hoteller" />
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
                <div className="hotel-field-value">{displayRoomLabel(h.room)}</div>
              </div>
              <div>
                <div className="hotel-field-label">Måltider</div>
                <div className="hotel-field-value">{h.meals}</div>
              </div>
              <div>
                <div className="hotel-field-label">Check-in</div>
                <div className="hotel-field-value">{formatLongDateDK(h.checkIn)}</div>
              </div>
              <div>
                <div className="hotel-field-label">Check-ud</div>
                <div className="hotel-field-value">{formatLongDateDK(h.checkOut)}</div>
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
            {h.isPackage && h.subHotels && h.subHotels.length > 0 && (
              <div className="mx-6 mb-5 mt-1 p-4 bg-rainforest/5 border border-rainforest/20 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-rainforest/80 mb-3 font-medium">
                  Hotellerne på pakke-rejsen
                </div>
                <ul className="space-y-2">
                  {h.subHotels.map((sub, idx) => (
                    <li key={idx} className="text-sm text-grey-text border-l-2 border-gold/50 pl-3 py-1">
                      <span className="font-medium text-rainforest">{sub.name}</span>
                      {sub.location && <span className="text-grey-text"> · {sub.location}</span>}
                      {sub.nights > 0 && <span className="text-grey-text"> · {sub.nights} {sub.nights === 1 ? "nat" : "nætter"}</span>}
                      {sub.room && <div className="text-xs text-grey-text mt-0.5">{displayRoomLabel(sub.room)}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {h.included && h.included.length > 0 && (
              <div className="px-6 pb-3">
                <div className="text-xs uppercase tracking-wider text-rainforest/70 mb-2 font-medium">
                  Inkluderet i prisen
                </div>
                <ul className="space-y-1 text-sm text-grey-text">
                  {h.included.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {h.notIncluded && h.notIncluded.length > 0 && (
              <div className="px-6 pb-3">
                <div className="text-xs uppercase tracking-wider text-rainforest/70 mb-2 font-medium">
                  Ikke inkluderet
                </div>
                <ul className="space-y-1 text-sm text-grey-text">
                  {h.notIncluded.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {h.notes && h.notes.length > 0 && (
              <div className="px-6 pb-5">
                {h.notes.map((note, idx) => (
                  <p key={idx} className="text-xs text-grey-text/80 italic mt-1">
                    {note}
                  </p>
                ))}
              </div>
            )}
            {(h.alternatives ?? []).map((alt, altIdx) => (
              <div key={altIdx} className="mx-6 mb-5 mt-1 p-4 bg-sand-page/60 border border-sand rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gold mb-2 font-medium">
                  Dette resort kunne også være noget for jer
                </div>
                <div className="font-serif text-lg text-rainforest mb-1">
                  {alt.name}
                </div>
                {alt.description && (
                  <div className="text-sm text-grey-text mb-2">
                    {alt.description}
                  </div>
                )}
                {(alt.nights > 0 || alt.meals) && (
                  <div className="text-xs text-grey-text">
                    {alt.nights > 0 && `${alt.nights} nætter`}
                    {alt.nights > 0 && alt.meals && " · "}
                    {alt.meals}
                  </div>
                )}
                {alt.savings && (
                  <div className="mt-2 text-sm text-rainforest font-medium">
                    {formatAlternativePriceLine(alt.savings)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
