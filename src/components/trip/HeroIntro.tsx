"use client";

import { useState } from "react";
import { splitIntro } from "@/lib/hero-intro";

// Claude Design v2 sætter introen i to niveauer: et fremhævet anslag (.lead)
// og resten i brødtekst (.rest). Vores intro er én rådgiverskrevet tekst, så
// anslaget er tekstens egen første sætning — intet omskrives, intet slettes.
// Rigtige introer er median ~560 tegn og ville fylde fotoet, så resten foldes
// ud på klik. Hele teksten ligger i DOM'en hele tiden.
export function HeroIntro({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { lead, rest, leadTruncated } = splitIntro(text);
  if (!lead) return null;

  if (!rest) {
    return (
      <p className="hero-intro">
        <span className="lead">{lead}</span>
      </p>
    );
  }

  return (
    <div className="hero-intro-wrap">
      <p className="hero-intro" id="hero-intro-text">
        <span className="lead">{!open && leadTruncated ? `${lead} …` : lead}</span>
        <span className="rest" hidden={!open}>
          {rest}
        </span>
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
