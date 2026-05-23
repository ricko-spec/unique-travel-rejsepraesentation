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
          <div className="meta-value">{trip.travellers}</div>
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
