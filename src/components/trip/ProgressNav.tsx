"use client";

import { useEffect, useState } from "react";
import { isScrolledToBottom, type NavSection } from "@/lib/progress-nav";

// Desktop progress-nav (Issue #40, ≥1180px — display:none under det, sat i
// CSS). `sections` kommer allerede filtreret fra page.tsx (visibleNavSections)
// så komponenten kun kender til ankre der faktisk findes i DOM'en.
export function ProgressNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const lastSectionId = sections[sections.length - 1]?.id ?? null;

  useEffect(() => {
    if (sections.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    // Reviewfund: den sidste sektion (typisk KONTAKT) kan sidde for tæt på
    // sidens bund til nogensinde at krydse observer-båndet nedenfor — der er
    // simpelthen ikke scroll-plads nok efter den til at få dens top ind i
    // båndet. "Er brugeren ved bunden af siden" har derfor ALTID forrang,
    // og tjekkes hver gang — både fra selve IO-callbacket og fra en
    // scroll/resize-lytter. Begge steder læser isScrolledToBottom() de
    // aktuelle, levende scroll-mål (ikke gemte/forældede værdier), så uanset
    // hvilken af de to der fyrer sidst efter en scroll er slut, lander de på
    // samme, korrekte konklusion — det er det der forhindrer et kapløb hvor
    // IO's egen (bånd-baserede) svar overskriver bund-tjekket, eller omvendt.
    function computeActive(fallbackCandidateId?: string) {
      const atBottom =
        lastSectionId !== null &&
        isScrolledToBottom({
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          documentHeight: document.documentElement.scrollHeight,
        });
      if (atBottom) {
        setActive(lastSectionId);
        return;
      }
      if (fallbackCandidateId) setActive(fallbackCandidateId);
    }

    // Samme rootMargin/threshold som Claude Design-prototypen: et smalt
    // "trigger-bånd" midt i viewporten (25%–45% nede) gør at kun én sektion
    // typisk krydser det ad gangen — det er det der forhindrer flakken
    // mellem to labels ved sektionsgrænser.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        computeActive(visible[0]?.target.id);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0 },
    );

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => io.observe(el));

    // Supplement til IO: fanger "ved bunden"-tilstanden selv i de (sjældne)
    // tilfælde hvor en scroll ikke udløser en ny IO-beregning, fx efter en
    // resize. Rører ikke ved den aktive sektion når brugeren IKKE er ved
    // bunden — så den kan aldrig overstyre IO's normale bånd-baserede svar
    // for de øvrige sektioner.
    function onScrollOrResize() {
      computeActive();
    }
    onScrollOrResize();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [sections, lastSectionId]);

  if (sections.length === 0) return null;

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    // Sæt aktiv med det samme ved klik — observer-båndet (og, for den
    // sidste sektion, bund-tjekket ovenfor) kan ellers være for langsom
    // eller aldrig nå at bekræfte det, især for KONTAKT nær sidens bund.
    setActive(id);
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
