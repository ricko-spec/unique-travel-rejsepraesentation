const { useState } = React;

// ===== Data =====
const trip = {
  destination: "Malaysia",
  bookingNo: "34415",
  subtitle: "Kuala Lumpur · Borneo · Perhentian Islands",
  departure: "26. juni 2027",
  return: "13. juli 2027",
  travellers: "2 voksne",
  advisor: "Ricko B.",
};

const itinerary = [
  {
    id: 1,
    type: "flight",
    typeLabel: "FLY · DAG 1",
    title: "Copenhagen → Kuala Lumpur",
    details: "Singapore Airlines SQ351 · Afg. 11:55 · Ank. 10:35 (+1)",
    chips: ["Via Singapore", "12t 30m", "Economy Flex"],
    obs: {
      title: "Terminalskift i Singapore",
      text: "Mellemlanding i Changi Airport — bagagen tjekkes hele vejen til Kuala Lumpur. Ca. 1t 30m mellem flyene.",
    },
  },
  {
    id: 2,
    type: "transfer",
    typeLabel: "TRANSFER · DAG 2",
    title: "Privat transfer til hotellet",
    details: "Privat bil fra lufthavnen · ca. 1 time",
    chips: ["Privat", "Inkluderet"],
    obs: {
      title: "Møde med chaufføren",
      text: "Chaufføren venter i ankomsthallen med skilt med jeres navn. Ring vores lokale partner på +60 12 555 0184 hvis I ikke finder ham.",
    },
  },
  {
    id: 3,
    type: "hotel",
    typeLabel: "HOTEL · 3 NÆTTER · DAG 2–5",
    title: "Meliá Hotel, Kuala Lumpur",
    details: "Melia Guest værelse · Morgenmad inkluderet",
    chips: ["3 nætter", "Morgenmad"],
  },
  {
    id: 4,
    type: "activity",
    typeLabel: "TURPROGRAM · 4 DAGE / 3 NÆTTER",
    title: "Orangutang Search — Borneo",
    details: "Sukau Rainforest Lodge · Alle måltider inkluderet",
    chips: ["Med guide", "Inkl. transfers", "Fuld pension"],
    expandKind: "program",
    expand: {
      days: [
        {
          label: "Dag 1 — Sandakan & Sepilok",
          text: "Ankomst til Sandakan og besøg ved Sepilok Orangutang Rehabiliteringscenter. Videre til Sukau Rainforest Lodge for indkvartering og aftensafari på Kinabatangan-floden.",
          meal: "Frokost og aftensmad inkluderet",
        },
        {
          label: "Dag 2 — Kinabatangan",
          text: "Morgensafari og safaricruise op af Kinabatangan-floden — én af de bedste destinationer for at se vilde orangutanger, næsehornsfugle og pygmæelefanter.",
          meal: "Morgenmad, frokost og aftensmad inkluderet",
        },
        {
          label: "Dag 3 — Menanggol-floden",
          text: "Morgensafari langs Menanggol-floden. Eftermiddag på lodgen med valgfri natur­vandring og endnu en aftensafari.",
          meal: "Alle måltider inkluderet",
        },
        {
          label: "Dag 4 — Retur til Sandakan",
          text: "Morgenmad og afsked med lodgen. Privat transfer retur til Sandakan og videre til næste destination.",
          meal: "Morgenmad inkluderet",
        },
      ],
      included: [
        "3 overnatninger på Sukau Rainforest Lodge",
        "Alle måltider undervejs",
        "Privat transfer Sandakan ⟷ lodge",
        "Engelsk­talende naturguide",
        "Alle safaricruises og udflugter pr. program",
      ],
    },
  },
  {
    id: 5,
    type: "activity",
    typeLabel: "AKTIVITETER · KOTA KINABALU",
    title: "Frie udflugtsmuligheder",
    details: "Vælg fra et udvalg af lokale oplevelser — bookes på stedet eller på forhånd.",
    expandKind: "activities",
    expand: {
      activities: [
        {
          title: "Borneo på to hjul",
          desc: "Cykeltur gennem rismarker og småbyer omkring Kota Kinabalu — en blid introduktion til hverdagslivet uden for storbyen.",
        },
        {
          title: "White water rafting",
          desc: "Rafting på Padas-floden, klasse III–IV. En aktiv dag i den tropiske jungle med erfarne lokale guides.",
        },
        {
          title: "Crocker Range Nationalpark",
          desc: "Dagstur i den frodige bjergkæde syd for Kota Kinabalu med vandreture, vandfald og besøg hos lokale Kadazan-landsbyer.",
        },
      ],
    },
  },
  {
    id: 6,
    type: "transfer",
    typeLabel: "TRANSFER · DAG 12",
    title: "Færge til Perhentian Islands",
    details: "Privat transfer til Kuala Besut · færge til Tuna Bay Island Resort",
    chips: ["Privat bil", "Færge"],
    obs: {
      title: "Hotellet henter på havnen",
      text: "Tuna Bay’s båd henter jer ved ankomstmolen på Perhentian Kecil. Husk solcreme — sidste etape er en kort åben bådtur.",
    },
  },
  {
    id: 7,
    type: "hotel",
    typeLabel: "HOTEL · 6 NÆTTER · DAG 12–18",
    title: "Tuna Bay Island Resort",
    details: "Standardværelse · Morgenmad inkluderet · Strandbeliggenhed",
    chips: ["6 nætter", "Morgenmad", "Strand"],
  },
  {
    id: 8,
    type: "flight",
    typeLabel: "FLY · DAG 18",
    title: "Kuala Lumpur → Copenhagen",
    details: "Singapore Airlines SQ352 · Afg. 23:55 · Ank. 06:55 (+1)",
    chips: ["Via Singapore", "Economy Flex"],
  },
];

const hotels = [
  {
    name: "Meliá Hotel",
    location: "Kuala Lumpur",
    nights: 3,
    room: "Melia Guest værelse",
    meals: "Morgenmad",
    checkIn: "27. jun 2027",
    checkOut: "30. jun 2027",
  },
  {
    name: "Sukau Rainforest Lodge",
    location: "Borneo",
    nights: 3,
    room: "Deluxe værelse",
    meals: "Alle måltider",
    checkIn: "1. jul 2027",
    checkOut: "4. jul 2027",
  },
  {
    name: "Tuna Bay Island Resort",
    location: "Perhentian Islands",
    nights: 6,
    room: "Standardværelse",
    meals: "Morgenmad",
    checkIn: "7. jul 2027",
    checkOut: "13. jul 2027",
  },
];

// ===== Components =====
const HERO_PHOTO = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=2400&q=80&auto=format&fit=crop";

function Hero() {
  return (
    <section className="hero">
      <div className="hero-fallback"></div>
      <img
        className="hero-photo-img"
        src={HERO_PHOTO}
        alt=""
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <div className="hero-overlay"></div>
      <div className="hero-inner">
        <div className="hero-top">
          <div className="wordmark">Unique Travel</div>
          <a className="hero-kontakt-btn" href="#kontakt">Kontakt</a>
        </div>

        <div className="hero-body">
          <div className="hero-kicker">Rejseforslag</div>
          <h1 className="hero-title">{trip.destination}</h1>

          <div className="hero-pills">
            <span className="hero-pill">{trip.subtitle}</span>
            <span className="hero-pill">{trip.departure} – {trip.return}</span>
          </div>

          <p className="hero-intro">
            Et personligt sammensat rejseforslag, hvor Kuala Lumpurs storbyenergi, Borneos regnskove og orangutanger samt Perhentian Islands’ hvide strande og turkise lagune samles i én skræddersyet kombinationsrejse.
          </p>

          <a className="hero-cta" href="#kontakt">
            <span>Kontakt os om rejsen</span>
            <span className="arr">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function TripDetails() {
  return (
    <section className="details-strip">
      <div className="details-grid">
        <div>
          <div className="meta-label">Afrejse</div>
          <div className="meta-value">{trip.departure}</div>
        </div>
        <div>
          <div className="meta-label">Hjemkomst</div>
          <div className="meta-value">{trip.return}</div>
        </div>
        <div>
          <div className="meta-label">Rejsende</div>
          <div className="meta-value">{trip.travellers}</div>
        </div>
        <div>
          <div className="meta-label">Rådgiver</div>
          <div className="meta-value">{trip.advisor} · Booking #{trip.bookingNo}</div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ label }) {
  return (
    <div className="section-header">
      <div className="caps">{label}</div>
      <div className="line" />
    </div>
  );
}

function TimelineItem({ item, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const dotClass = `tl-dot is-${item.type}`;
  const typeClass = `tl-type is-${item.type}`;

  const toggleLabel =
    item.expandKind === "program" ? "Læs dagsprogram" :
    item.expandKind === "activities" ? "Se udflugtsmuligheder" : null;

  return (
    <div className="tl-item">
      <div className={dotClass}></div>
      <div className="tl-card">
        <div className={typeClass}>{item.typeLabel}</div>
        <div className="tl-title">{item.title}</div>
        <div className="tl-details">{item.details}</div>

        {item.chips && item.chips.length > 0 && (
          <div className="chips">
            {item.chips.map((c, i) => (
              <span key={i} className="chip">{c}</span>
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

        {item.expand && (
          <>
            <button
              className={`tl-toggle ${open ? "open" : ""}`}
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
            >
              <span>{open ? "Skjul" : toggleLabel}</span>
              <span className="arrow">▾</span>
            </button>

            <div className={`tl-expand ${open ? "open" : ""}`}>
              <div className="tl-expand-inner">
                {item.expandKind === "program" && (
                  <>
                    {item.expand.days.map((d, i) => (
                      <div key={i} className="day">
                        <div className="day-label">{d.label}</div>
                        <div className="day-text">{d.text}</div>
                        {d.meal && <div className="day-meal">{d.meal}</div>}
                      </div>
                    ))}
                    <div className="incl">
                      <div className="incl-label">Inkluderet</div>
                      <ul>
                        {item.expand.included.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {item.expandKind === "activities" && (
                  <>
                    {item.expand.activities.map((a, i) => (
                      <div key={i} className="activity-item">
                        <div className="activity-title">{a.title}</div>
                        <div className="activity-desc">{a.desc}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Timeline() {
  return (
    <section>
      <SectionHeader label="Rejseplan" />
      <div className="timeline">
        <div className="tl-track">
          {itinerary.map(item => (
            <TimelineItem
              key={item.id}
              item={item}
              defaultOpen={item.expandKind === "program"}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Hotels() {
  return (
    <section>
      <SectionHeader label="Jeres hoteller" />
      <div className="hotels">
        {hotels.map((h, i) => (
          <div className="hotel" key={i}>
            <div className="hotel-head">
              <div>
                <div className="hotel-name">{h.name}</div>
                <div className="hotel-loc">{h.location}</div>
              </div>
              <div className="hotel-nights">
                <div className="hotel-nights-num">{h.nights}</div>
                <div className="hotel-nights-lbl">{h.nights === 1 ? "nat" : "nætter"}</div>
              </div>
            </div>
            <div className="hotel-body">
              <div>
                <div className="hotel-field-label">Værelse</div>
                <div className="hotel-field-value">{h.room}</div>
              </div>
              <div>
                <div className="hotel-field-label">Måltider</div>
                <div className="hotel-field-value">{h.meals}</div>
              </div>
              <div>
                <div className="hotel-field-label">Check-in</div>
                <div className="hotel-field-value">{h.checkIn}</div>
              </div>
              <div>
                <div className="hotel-field-label">Check-ud</div>
                <div className="hotel-field-value">{h.checkOut}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Price() {
  return (
    <section>
      <SectionHeader label="Pris" />
      <div className="price-wrap">
        <div className="price">
          <div>
            <div className="price-label">Samlet pakkerejsepris</div>
            <div className="price-total">83.045 kr.</div>
            <div className="price-per">41.523 kr. pr. person · 2 voksne</div>
          </div>
          <div className="price-divider" />
          <div className="price-note">
            Inkluderer fly, alle transfers, hotel og program som beskrevet. Rejseforsikring og visum ikke inkluderet.
          </div>
        </div>
      </div>

      <div className="note-wrap">
        <div className="note">
          <strong>God at vide.</strong><br />
          Husk gyldigt pas med mindst 6 måneders gyldighed efter hjemkomst. Vaccinationer anbefales — kontakt egen læge eller vaccinationsklinik i god tid. Detaljer om annullering, forsikring og indrejse fremgår af det fremsendte rejsedokument.
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="kontakt">
      <div className="cta-wrap">
        <a className="cta" href="#">
          <div>
            <div className="cta-text-l">Spørgsmål til jeres rejse?</div>
            <div className="cta-text-s">Ring eller skriv direkte til Ricko</div>
          </div>
          <div className="cta-arrow">→</div>
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <div className="footer">
      <div className="footer-mark">Unique Travel</div>
      <div className="footer-line">Skræddersyede rejser · København</div>
    </div>
  );
}

function ActionBar() {
  return (
    <div className="action-bar">
      <a className="action-ring" href="tel:+4570260051">Ring</a>
      <a className="action-contact" href="#kontakt">Kontakt os</a>
    </div>
  );
}

function App() {
  return (
    <div className="page">
      <Hero />
      <TripDetails />
      <Timeline />
      <Hotels />
      <Price />
      <CTA />
      <Footer />
      <ActionBar />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
