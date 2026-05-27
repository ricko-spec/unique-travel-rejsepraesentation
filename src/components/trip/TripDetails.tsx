import type { Trip } from "@/lib/types";

export function TripDetails({ trip }: { trip: Trip }) {
  return (
    <section className="details-strip">
      <div className="details-grid">
        <div>
          <div className="meta-label">Afrejse</div>
          <div className="meta-value">{trip.departure}</div>
        </div>
        <div>
          <div className="meta-label">Hjemkomst</div>
          <div className="meta-value">{trip.return}</div>
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
                  {names.map((n, i) => <div key={i}>{n}</div>)}
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
