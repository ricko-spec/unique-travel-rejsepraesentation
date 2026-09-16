"use client";

import { useEffect, useState } from "react";
import type { NavSection } from "@/lib/progress-nav";

// Desktop progress-nav (Issue #40, ≥1180px — display:none under det, sat i
// CSS). `sections` kommer allerede filtreret fra page.tsx (visibleNavSections)
// så komponenten kun kender til ankre der faktisk findes i DOM'en.
export function ProgressNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (sections.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    // Samme rootMargin/threshold som Claude Design-prototypen: et smalt
    // "trigger-bånd" midt i viewporten (25%–45% nede) gør at kun én sektion
    // typisk krydser det ad gangen — det er det der forhindrer flakken
    // mellem to labels ved sektionsgrænser.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0 },
    );

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    // DO-NOT-CHANGE §8: ikke scrollIntoView — beregn offset og brug
    // window.scrollTo, som prototypen gør.
    const top = el.getBoundingClientRect().top + window.scrollY - 24;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <nav className="progress-nav" aria-label="Sektioner">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`pn-item ${active === s.id ? "active" : ""}`}
          onClick={() => go(s.id)}
          aria-current={active === s.id ? "true" : undefined}
        >
          <span className="pn-label">{s.label}</span>
          <span className="pn-dash" />
        </button>
      ))}
    </nav>
  );
}
