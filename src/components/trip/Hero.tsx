"use client";

import { useState } from "react";
import type { Trip } from "@/lib/types";
import { nightsLabel, totalNights } from "@/lib/trip-overview";
import { HeroIntro } from "./HeroIntro";

const ADVISOR_PHONE = "+4559498630";

export function Hero({ trip, heroPhoto }: { trip: Trip; heroPhoto: string | null }) {
  const [photoOk, setPhotoOk] = useState(true);

  // Vision 2.0 fase 1: heroen svarer på "hvor, hvor længe og hvad" — datoerne
  // står samlet i rejseoverblikket lige nedenfor, så de ikke gentages her.
  // Varigheden er det tal kunden ellers selv skulle regne ud af to datoer.
  const nights = nightsLabel(totalNights(trip.hotels));

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
          <img
            className="hero-logo"
            src="/brand/unique-travel-logo-white.png"
            alt="Unique Travel"
            width={987}
            height={332}
          />
          <a className="hero-kontakt-btn" href="#kontakt">
            Kontakt
          </a>
        </div>

        <div className="hero-body">
          <div className="hero-kicker">Rejseforslag</div>
          <h1 className="hero-title">{trip.destination}</h1>

          {(nights || trip.subtitle) && (
            <div className="hero-pills">
              {nights && <span className="hero-pill is-key">{nights}</span>}
              {trip.subtitle && <span className="hero-pill">{trip.subtitle}</span>}
            </div>
          )}

          {trip.intro && <HeroIntro text={trip.intro} />}

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
