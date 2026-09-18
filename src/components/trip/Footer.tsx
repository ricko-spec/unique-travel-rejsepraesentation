import { TRACKING_NOTICE } from "@/lib/tracking-notice";

export function Footer() {
  return (
    <div className="footer">
      <div className="footer-mark">Unique Travel</div>
      <div className="footer-line">Skræddersyede rejser · København</div>
      {/* Vision 3.0 Fase 2 (Issue #71): diskret transparens på den oplåste
          side — kunder med en eksisterende 30-dages adgangscookie går direkte
          hertil og ser aldrig AccessGate. Ingen banner/modal/checkbox/cookie. */}
      <p className="footer-notice">{TRACKING_NOTICE}</p>
    </div>
  );
}
