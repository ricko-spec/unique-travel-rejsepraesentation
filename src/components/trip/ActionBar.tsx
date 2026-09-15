export function ActionBar({ hasContact }: { hasContact: boolean }) {
  return (
    <div className="action-bar">
      <a className="action-ring" href="tel:+4559498630">
        Ring
      </a>
      {/* ContactCTA renderer intet uden trip.advisorEmail, og id="kontakt"
          findes derfor ikke — uden dette tjek pegede knappen på et dødt anker. */}
      {hasContact && (
        <a className="action-contact" href="#kontakt">
          Kontakt os
        </a>
      )}
    </div>
  );
}
