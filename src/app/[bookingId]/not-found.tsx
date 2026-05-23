export default function NotFound() {
  return (
    <div className="error-page">
      <div className="error-card">
        <div className="error-mark">Unique Travel</div>
        <div className="error-title">Vi kunne ikke finde denne rejseplan</div>
        <p className="error-body">
          Linket er måske udløbet, eller adressen er skrevet forkert. Kontakt os på{" "}
          <a className="error-phone" href="tel:+4559498630">
            59 49 86 30
          </a>{" "}
          så hjælper vi jer videre.
        </p>
      </div>
    </div>
  );
}
