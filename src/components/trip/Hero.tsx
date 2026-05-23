"use client";

import { useState } from "react";
import type { Trip } from "@/lib/types";

const ADVISOR_PHONE = "+4559498630";

export function Hero({ trip, heroPhoto }: { trip: Trip; heroPhoto: string | null }) {
  const [photoOk, setPhotoOk] = useState(true);

  return (
    <section className="hero">
      <div className="hero-fallback" />
      {heroPhoto && photoOk && (
        <img
          className="hero-photo-img"
          src={heroPhoto}
          alt=""
          onError={() => setPhotoOk(false)}
        />
      )}
      <div className="hero-overlay" />
      <div className="hero-ornament" />
      <div className="hero-inner">
        <div className="hero-top">
          <div className="wordmark">Unique Travel</div>
          <a className="hero-kontakt-btn" href="#kontakt">
            Kontakt
          </a>
        </div>

        <div className="hero-body">
          <div className="hero-kicker">Rejseforslag</div>
          <h1 className="hero-title">{trip.destination}</h1>

          <div className="hero-pills">
            {trip.subtitle && <span className="hero-pill">{trip.subtitle}</span>}
            <span className="hero-pill">
              {trip.departure} – {trip.return}
            </span>
          </div>

          {trip.intro && <p className="hero-intro">{trip.intro}</p>}

          <a className="hero-cta" href="#kontakt">
            <span>Kontakt os om rejsen</span>
            <span className="arr">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

export { ADVISOR_PHONE };
