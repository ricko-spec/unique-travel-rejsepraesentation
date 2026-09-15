"use client";

import { useState } from "react";
import Image from "next/image";
import type { Trip } from "@/lib/types";
import { formatMediumDateDK } from "@/lib/format";
import { HeroIntro } from "./HeroIntro";

const ADVISOR_PHONE = "+4559498630";

export function Hero({ trip, heroPhoto }: { trip: Trip; heroPhoto: string | null }) {
  const [photoOk, setPhotoOk] = useState(true);

  // Claude Design v2: to pills under titlen — ruten og datointervallet.
  const period = [formatMediumDateDK(trip.departure), formatMediumDateDK(trip.return)]
    .filter(Boolean)
    .join(" – ");

  return (
    <section className="hero">
      <div className="hero-fallback" />
      {heroPhoto && photoOk && (
        // Above-the-fold/LCP-billede: priority + fetchPriority slår lazy-load fra.
        // onError bevarer den eksisterende gradient-fallback uændret (DO-NOT-CHANGE §2).
        <Image
          className="hero-photo-img"
          src={heroPhoto}
          alt=""
          fill
          sizes="100vw"
          priority
          onError={() => setPhotoOk(false)}
        />
      )}
      <div className="hero-overlay" />
      <div className="hero-ornament" />
      <div className="hero-inner">
        <div className="hero-top">
          <Image
            className="hero-logo"
            src="/brand/unique-travel-logo-white.png"
            alt="Unique Travel"
            width={987}
            height={332}
            sizes="(min-width: 760px) 168px, 124px"
          />
          <a className="hero-kontakt-btn" href="#kontakt">
            Kontakt
          </a>
        </div>

        <div className="hero-body">
          <div className="hero-kicker">Rejseforslag</div>
          <h1 className="hero-title">{trip.destination}</h1>

          {(trip.subtitle || period) && (
            <div className="hero-pills">
              {trip.subtitle && <span className="hero-pill">{trip.subtitle}</span>}
              {period && <span className="hero-pill">{period}</span>}
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
