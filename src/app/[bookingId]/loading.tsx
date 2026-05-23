export default function Loading() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-fallback" />
        <div className="hero-overlay" />
        <div className="hero-inner">
          <div className="hero-top">
            <div className="wordmark">Unique Travel</div>
          </div>
          <div className="hero-body">
            <div className="hero-kicker">Rejseforslag</div>
            <div className="skeleton" style={{ height: 84, width: "60%", marginBottom: 22 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
              <div className="skeleton" style={{ height: 32, width: 220 }} />
              <div className="skeleton" style={{ height: 32, width: 240 }} />
            </div>
            <div className="skeleton" style={{ height: 60, width: "70%", maxWidth: 560 }} />
          </div>
        </div>
      </section>
      <section className="details-strip">
        <div className="details-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="meta-label">&nbsp;</div>
              <div className="skeleton" style={{ height: 16, background: "rgba(226,220,205,0.2)" }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
