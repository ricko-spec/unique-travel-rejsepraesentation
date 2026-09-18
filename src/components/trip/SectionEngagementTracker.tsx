"use client";

import { useEffect } from "react";
import {
  SECTION_DOM_ID,
  SECTION_DWELL_MS,
  dwellReducer,
  shouldSendSection,
  type SectionId,
  type DwellState,
} from "@/lib/section-engagement";

// Vision 3.0 Fase 2 (Issue #71) — kundevendt, usynlig tracker. Renderer
// ALDRIG noget (return null) og ændrer intet ved de fem eksisterende
// sektioners eget design. `sections` kommer allerede eligibility-filtreret
// fra page.tsx (samme mønster som ProgressNav.tsx's `sections`-prop) — denne
// komponent observerer aldrig en sektion der ikke findes i DOM'en.
//
// HVORFOR "SET" = kontinuerlig synlighed ET STED I VIEWPORTET I ≥750 MS, UDEN
// noget rootMargin-bånd eller et krav om at en bestemt PROCENTDEL af
// sektionen skal være synlig:
//
// ProgressNav.tsx (Issue #40) bruger et smalt trigger-BÅND midt i viewporten
// (rootMargin "-25% 0px -55% 0px") — men det løser et ANDET problem: "hvilken
// ÉN sektion er lige nu mest fremtrædende" (gensidig eksklusion, kun én
// vinder ad gangen). Det krævede siden et separat isScrolledToBottom()-værn,
// fordi den sidste sektion (typisk KONTAKT) ofte slet ikke har nok
// scroll-plads bagved sig til at dens top nogensinde kan nå ind i et bånd
// der ligger midt i viewporten.
//
// Denne tracker løser et andet problem: "ER denne ene sektion (uafhængigt af
// de andre) blevet set i et meningsfuldt stykke tid" — ikke et
// gensidigt-eksklusivt valg. Løsningen er derfor bevidst IntersectionObservers
// egne DEFAULT-indstillinger (root: viewport, rootMargin: "0px",
// threshold: 0 — "et hvilket som helst overlap med viewportet tæller som
// synligt") + en uafhængig dwell-timer PR. SEKTION:
//   - Meget høj sektion (fx en lang Timeline): er kontinuerligt delvist
//     synlig i HELE den tid brugeren scroller igennem den — båndproblemet
//     opstår slet ikke, for der er intet bånd at nå.
//   - Kort sektion nær bunden (fx KONTAKT): så snart en hvilken som helst
//     del af den entrer viewportet — herunder når den til sidst "sidder
//     fast" nederst i viewportet fordi siden ikke kan scrolle længere —
//     tæller den som synlig. Intet separat bund-af-siden-værn nødvendigt.
// Selve "flår hurtigt forbi tæller ikke"-kravet varetages UDELUKKENDE af
// dwell-timeren (SECTION_DWELL_MS), ikke af rootMargin/threshold-valget: en
// sektion der kun er synlig i et kort øjeblik når aldrig at akkumulere
// SECTION_DWELL_MS sammenhængende ms, uanset hvor generøs
// synligheds-definitionen er.
//
// Selve state-overgangene (enter/leave/timeout -> idle/pending/qualified) er
// en ren, separat reducer (dwellReducer, src/lib/section-engagement.ts) —
// netop for at kunne unit-teste "entering + dwell => qualify" / "leaves før
// dwell => cancel" / "re-enters => kan kvalificere senere" uden en browser.
// Denne komponent er bevidst en TYND wrapper: den oversætter kun rigtige
// IntersectionObserver-/setTimeout-hændelser til reducer-actions og udfører
// de returnerede effekter.
export function SectionEngagementTracker({
  slug,
  sections,
}: {
  slug: string;
  sections: SectionId[];
}) {
  useEffect(() => {
    if (sections.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    const dwellState = new Map<SectionId, DwellState>();
    const timers = new Map<SectionId, ReturnType<typeof setTimeout>>();
    // Per-page-load dedup — UDELUKKENDE in-memory. Ingen cookie, ingen
    // localStorage, ingen sessionStorage (Issue #71). Et refresh nulstiller
    // denne Set naturligt, fordi hele komponenten monteres forfra — DB'en
    // opdaterer da blot last_seen_at igen, hvilket er tilsigtet.
    const sent = new Set<SectionId>();

    function cleanupTimer(section: SectionId) {
      const t = timers.get(section);
      if (t !== undefined) {
        clearTimeout(t);
        timers.delete(section);
      }
    }

    function send(section: SectionId) {
      // Ren, testet dedup-beslutning (shouldSendSection,
      // src/lib/section-engagement.ts) — "samme sektion højst én gang pr.
      // page load" + det eksplicitte fem-sektioners-loft, uden en browser.
      if (!shouldSendSection(sent, section)) return;
      sent.add(section);

      // Fire-and-forget: IKKE await'et af kalderen. Fejl/afvisninger
      // saniteres stille — INGEN fejl-UI til kunden, INGEN retry-loop. Selve
      // fetch-kaldet kan aldrig blokere rendering, fordi det sker i en
      // useEffect efter commit, helt uden for React's render-sti.
      fetch(`/${slug}/engagement`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        // Bevidst tomt: ingen retry, ingen console-støj, ingen global
        // fejltilstand. Kundesiden må aldrig kunne blive dårligere af dette.
      });
    }

    function dispatch(section: SectionId, action: "enter" | "leave" | "timeout") {
      const current = dwellState.get(section) ?? "idle";
      const { state, effect } = dwellReducer(current, action);
      dwellState.set(section, state);
      switch (effect) {
        case "start-timer":
          cleanupTimer(section);
          timers.set(
            section,
            setTimeout(() => dispatch(section, "timeout"), SECTION_DWELL_MS),
          );
          break;
        case "cancel-timer":
          cleanupTimer(section);
          break;
        case "qualify":
          cleanupTimer(section);
          send(section);
          break;
        case "none":
          break;
      }
    }

    const elementToSection = new Map<Element, SectionId>();
    for (const section of sections) {
      const el = document.getElementById(SECTION_DOM_ID[section]);
      if (el) elementToSection.set(el, section);
    }
    if (elementToSection.size === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const section = elementToSection.get(entry.target);
          if (!section) continue;
          dispatch(section, entry.isIntersecting ? "enter" : "leave");
        }
      },
      { threshold: 0 },
    );
    elementToSection.forEach((_section, el) => io.observe(el));

    return () => {
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sections.join(",")]);

  return null;
}
