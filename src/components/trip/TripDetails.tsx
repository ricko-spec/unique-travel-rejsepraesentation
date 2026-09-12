import { type Trip, formatLongDateDK } from "@/lib/types";
import { splitTravellers } from "@/lib/travellers";

// Info-strippen fra Claude Design v2: egen mørkegrøn sektion under hero med
// fire felter — Afrejse / Hjemkomst / Rejsende / Rådgiver (+ bookingnr.).
// To kolonner på mobil, fire fra 760px.
//
// Det eneste vi lægger oven i designet er Rejsende-feltet: navnelisten sættes
// med ét navn pr. linje, så rejser med mange rejsende hverken klipper navne af
// eller brækker et efternavn midt over. Ingen navne fjernes.
export function TripDetails({ trip }: { trip: Trip }) {
  const { names, summary } = splitTravellers(trip.travellers);

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
            {names.length <= 1 ? (
              trip.travellers
            ) : (
              <>
                <div className="meta-names">
                  {names.map((n, i) => (
                    <span key={i}>{n}</span>
                  ))}
                </div>
                {summary && <div className="meta-sub">({summary})</div>}
              </>
            )}
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
