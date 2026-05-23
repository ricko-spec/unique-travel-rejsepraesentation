"use client";

import { useState } from "react";
import type {
  ItineraryItem,
  ProgramExpand,
  ActivitiesExpand,
  FlightExpand,
} from "@/lib/types";
import { SectionHeader } from "./SectionHeader";

function TimelineItem({ item, defaultOpen }: { item: ItineraryItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);

  // A single optional activity is really an included excursion, not a list of
  // options — so the label changes accordingly.
  const activitiesCount =
    item.expandKind === "activities" && item.expand && "activities" in item.expand
      ? (item.expand.activities?.length ?? 0)
      : 0;
  const isSingleExcursion =
    item.expandKind === "program" ||
    (item.expandKind === "activities" && activitiesCount === 1);

  const toggleLabel =
    item.expandKind === "flight"
      ? "Se flydetaljer"
      : isSingleExcursion
      ? "Læs om udflugten"
      : item.expandKind === "activities"
      ? "Se udflugtsmuligheder"
      : null;

  return (
    <div className="tl-item">
      <div className={`tl-dot is-${item.type}`} />
      <div className="tl-card">
        <div className={`tl-type is-${item.type}`}>{item.typeLabel}</div>
        <div className="tl-title">{item.title}</div>
        {item.details && <div className="tl-details">{item.details}</div>}

        {item.chips && item.chips.length > 0 && (
          <div className="chips">
            {item.chips.map((c, i) => (
              <span key={i} className="chip">
                {c}
              </span>
            ))}
          </div>
        )}

        {item.obs && (
          <div className="obs">
            <div className="obs-icon">!</div>
            <div className="obs-text">
              <strong>{item.obs.title}</strong>
              {item.obs.text}
            </div>
          </div>
        )}

        {item.expandKind && toggleLabel && (
          <>
            <button
              type="button"
              className={`tl-toggle ${open ? "open" : ""}`}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              <span>{open ? "Skjul" : toggleLabel}</span>
              <span className="arrow">▾</span>
            </button>

            <div className={`tl-expand ${open ? "open" : ""}`}>
              <div className="tl-expand-inner">
                {item.expandKind === "program" && (
                  <>
                    <p className="program-pdf-note">
                      Den fulde beskrivelse med alle detaljer fremgår af den vedhæftede PDF i din mail.
                    </p>
                    <ProgramContent expand={(item.expand ?? { days: [], included: [] }) as ProgramExpand} />
                  </>
                )}
                {item.expandKind === "activities" && (
                  <ActivitiesContent expand={(item.expand ?? { activities: [] }) as ActivitiesExpand} />
                )}
                {item.expandKind === "flight" && (
                  <FlightContent expand={(item.expand ?? { details: [] }) as FlightExpand} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProgramContent({ expand }: { expand: ProgramExpand }) {
  const days = expand.days ?? [];
  const included = expand.included ?? [];
  return (
    <>
      {days.map((d, i) => (
        <div key={i} className="day">
          <div className="day-label">{d.label}</div>
          <div className="day-text">{d.text}</div>
          {d.meal && <div className="day-meal">{d.meal}</div>}
        </div>
      ))}
      {included.length > 0 && (
        <div className="incl">
          <div className="incl-label">Inkluderet</div>
          <ul>
            {included.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function ActivitiesContent({ expand }: { expand: ActivitiesExpand }) {
  const activities = expand.activities ?? [];
  return (
    <>
      {activities.map((a, i) => (
        <div key={i} className="activity-item">
          <div className="activity-title">{a.title}</div>
          <div className="activity-desc">{a.desc}</div>
        </div>
      ))}
    </>
  );
}

function FlightContent({ expand }: { expand: FlightExpand }) {
  const details = expand.details ?? [];
  if (details.length === 0) {
    return (
      <p className="flight-empty">Ingen yderligere flydetaljer angivet i rejseplanen.</p>
    );
  }
  return (
    <dl className="flight-details">
      {details.map((d, i) => (
        <div key={i} className="flight-detail-row">
          <dt className="flight-detail-label">{d.label}</dt>
          <dd className="flight-detail-value">{d.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ itinerary }: { itinerary: ItineraryItem[] }) {
  return (
    <section>
      <SectionHeader label="Rejseplan" />
      <div className="timeline">
        <div className="tl-track">
          {itinerary.map((item) => (
            <TimelineItem key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
