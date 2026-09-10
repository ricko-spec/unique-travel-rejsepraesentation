import { type Trip, formatLongDateDK } from "@/lib/types";
import {
  destinationList,
  destinationsLabel,
  nightsLabel,
  splitTravellers,
  totalNights,
} from "@/lib/trip-overview";

// Vision 2.0 fase 1: rejseoverblik i stedet for den gamle 4-kolonners
// nøgleinfo-stribe (Afrejse / Hjemkomst / Rejsende / Rådgiver), der læste som
// en formular og klippede navnelisten på rejser med mange rejsende.
//
// Nu: rejseperioden samlet i ét felt, rejsens omfang som det kunden ellers
// selv skulle regne ud, og rejsende med plads til at fylde. Datoerne står kun
// her — heroen gentager dem ikke længere.
export function TripDetails({ trip }: { trip: Trip }) {
  const nights = nightsLabel(totalNights(trip.hotels));
  const destinations = destinationList(trip.hotels);
  const destLabel = destinationsLabel(destinations.length);
  const { names, summary } = splitTravellers(trip.travellers);

  const scope = [nights, destLabel].filter(Boolean).join(" · ");
  const departure = formatLongDateDK(trip.departure);
  const homecoming = formatLongDateDK(trip.return);

  return (
    <section className="overview">
      <div className="overview-inner">
        <div className="overview-primary">
          {(departure || homecoming) && (
            <div className="overview-block">
              <div className="meta-label">Rejseperiode</div>
              <div className="overview-dates">
                {departure && <span>{departure}</span>}
                {departure && homecoming && <span className="overview-dash">–</span>}
                {homecoming && <span>{homecoming}</span>}
              </div>
            </div>
          )}

          {scope && (
            <div className="overview-block">
              <div className="meta-label">Rejsens omfang</div>
              <div className="overview-scope">{scope}</div>
              {destinations.length > 1 && (
                <div className="overview-route">{destinations.join(" · ")}</div>
              )}
            </div>
          )}
        </div>

        <div className="overview-secondary">
          {names.length > 0 && (
            <div className="overview-block">
              <div className="meta-label">Rejsende</div>
              <div className="overview-travellers">
                {names.map((n, i) => (
                  <span key={i} className="overview-traveller">
                    {n}
                  </span>
                ))}
              </div>
              {summary && <div className="overview-travellers-sum">{summary}</div>}
            </div>
          )}

          <div className="overview-block">
            <div className="meta-label">Rådgiver</div>
            <div className="meta-value">
              {trip.advisor}
              <span className="overview-booking">Booking #{trip.bookingNo}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
