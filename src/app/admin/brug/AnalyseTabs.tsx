"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ConversionMeasurement } from "../ConversionMeasurement";
import { CustomerBehaviorPanel } from "./CustomerBehaviorPanel";
import { UsagePanel } from "./UsageOverview";
import { ANALYSE_TABS, analyseTabHref, nextTabIndex, parseAnalyseTab, type AnalyseTabKey } from "./analyse-tabs";

// Issue #92: Analyse (/admin/brug) med tre faner. Fanen ligger i URL'en
// (?visning=kunder|brug|konvertering), så den kan bogmærkes og deles; skift
// sker med history.pushState (ingen fuld reload), og tilbage/frem følges via
// popstate. WAI-ARIA-faner: role=tablist/tab/tabpanel, roving tabindex,
// piletaster/Home/End flytter fokus og vælger.
//
// Hvert panel henter sine egne data med egen loading-/fejltilstand. Et panel
// monteres første gang det vises og forbliver monteret (skjult), så et
// fanebyt ikke henter igen eller nulstiller filtre.
export function AnalyseTabs({ initialTab }: { initialTab: AnalyseTabKey }) {
  const [active, setActive] = useState<AnalyseTabKey>(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<AnalyseTabKey>>(() => new Set([initialTab]));
  const tabRefs = useRef<Record<AnalyseTabKey, HTMLButtonElement | null>>({ kunder: null, brug: null, konvertering: null });

  function show(key: AnalyseTabKey) {
    setActive(key);
    setVisited((v) => (v.has(key) ? v : new Set([...v, key])));
  }

  useEffect(() => {
    const onPop = () => show(parseAnalyseTab(new URLSearchParams(window.location.search).get("visning")));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function select(key: AnalyseTabKey, focus = false) {
    if (key !== active) {
      window.history.pushState(null, "", analyseTabHref(key));
      show(key);
    }
    if (focus) tabRefs.current[key]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = nextTabIndex(
      ANALYSE_TABS.findIndex((t) => t.key === active),
      e.key,
      ANALYSE_TABS.length,
    );
    if (target === null) return;
    e.preventDefault();
    select(ANALYSE_TABS[target].key, true);
  }

  return (
    <>
      <div className="admin-tabs" role="tablist" aria-label="Analyse" onKeyDown={onKeyDown}>
        {ANALYSE_TABS.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              type="button"
              role="tab"
              id={`analyse-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`analyse-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "admin-tab admin-tab-active" : "admin-tab"}
              onClick={() => select(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {ANALYSE_TABS.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`analyse-panel-${t.key}`}
          aria-labelledby={`analyse-tab-${t.key}`}
          hidden={t.key !== active}
        >
          {visited.has(t.key) && <TabContent tab={t.key} />}
        </div>
      ))}
    </>
  );
}

function TabContent({ tab }: { tab: AnalyseTabKey }) {
  if (tab === "kunder") return <CustomerBehaviorPanel />;
  if (tab === "brug") return <UsagePanel />;
  return <ConversionMeasurement />;
}
