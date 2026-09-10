"use client";

import { useState } from "react";

// Introen er median 563 tegn og fylder fire linjer brødtekst direkte på
// hero-fotoet. Her vises et kort anslag, mens resten foldes ud på klik.
// Teksten forkortes ALDRIG i data — hele introen ligger i DOM'en, og
// intet omskrives. Er teksten kort nok, vises den bare som før.
const CLAMP_AT = 180;

export function HeroIntro({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const full = text.trim();
  if (!full) return null;

  if (full.length <= CLAMP_AT) {
    return <p className="hero-intro">{full}</p>;
  }

  // Bryd ved sidste ordgrænse før grænsen, så anslaget ikke ender midt i et ord.
  const cut = full.lastIndexOf(" ", CLAMP_AT);
  const teaser = full.slice(0, cut > 0 ? cut : CLAMP_AT).replace(/[.,;:\s]+$/, "");

  return (
    <div className="hero-intro-wrap">
      <p className="hero-intro" id="hero-intro-text">
        {open ? full : `${teaser} …`}
      </p>
      <button
        type="button"
        className="hero-intro-toggle"
        aria-expanded={open}
        aria-controls="hero-intro-text"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Vis mindre" : "Læs mere"}
      </button>
    </div>
  );
}
