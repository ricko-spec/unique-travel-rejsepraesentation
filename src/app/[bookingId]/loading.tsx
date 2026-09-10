export default function Loading() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-fallback" />
        <div className="hero-overlay" />
        <div className="hero-inner">
          <div className="hero-top">
            <img
              className="hero-logo"
              src="/brand/unique-travel-logo-white.png"
              alt="Unique Travel"
              width={987}
              height={332}
            />
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
      {/* Skeletonet skal spejle rejseoverblikkets to grupper, ellers hopper
          layoutet når det rigtige indhold lander. */}
      <section className="overview">
        <div className="overview-inner">
          {[0, 1].map((col) => (
            <div key={col} className={col === 0 ? "overview-primary" : "overview-secondary"}>
              {[0, 1].map((i) => (
                <div key={i} className="overview-block">
                  <div className="meta-label">&nbsp;</div>
                  <div
                    className="skeleton"
                    style={{ height: 20, background: "rgba(226,220,205,0.2)" }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
