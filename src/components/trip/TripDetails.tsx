import { type Trip, formatLongDateDK } from "@/lib/types";

export function TripDetails({ trip }: { trip: Trip }) {
  return (
    <section className="details-strip">
      <div className="details-grid">
        <div>
          <div className="meta-label">Afrejse</div>
          <div className="meta-value">{formatLongDateDK(trip.departure)}</div>
        </div>
        <div>
          <div className="meta-label">Hjemkomst</div>
          <div className="meta-value">{formatLongDateDK(trip.return)}</div>
        </div>
        <div>
          <div className="meta-label">Rejsende</div>
          <div className="meta-value">
            {(() => {
              const t = trip.travellers || "";
              const m = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
              const namesPart = m ? m[1] : t;
              const summary = m ? m[2] : null;
              const names = namesPart.split(/,\s*|\s+og\s+/).map((n) => n.trim()).filter(Boolean);
              if (names.length <= 1) return t;
              return (
                <>
                  <div
                    className={
                      names.length > 6
                        ? "grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-base"
                        : ""
                    }
                  >
                    {names.map((n, i) => <div key={i}>{n}</div>)}
                  </div>
                  {summary && <div className="mt-2 text-sm opacity-70">({summary})</div>}
                </>
              );
            })()}
          </div>
        </div>
        <div>
          <div className="meta-label">Rådgiver</div>
          <div className="meta-value">
            {trip.advisor} · Booking #{trip.bookingNo}
          </div>
        </div>
      </div>
    </section>
  );
}
