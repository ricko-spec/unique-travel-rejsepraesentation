// Magic-byte-sniff for uploadede filer: MIME-headeren og filnavnet er
// klient-styrede og kan lyve — de første bytes af selve filen kan ikke.
// Samme princip som sniffImageFormat i
// src/app/admin/api/destinations/finalize-upload/route.ts (SEC-4-backloggen).

const PDF_MAGIC = "%PDF-";
// PDF-specifikationen tillader op til 1024 bytes "junk" før headeren i
// praksis (nogle generatorer indsætter en BOM eller kommentarer) — samme
// tolerance som gængse PDF-læsere/-validatorer bruger.
const PDF_HEADER_SCAN_WINDOW = 1024;

export function isPdf(buf: Buffer): boolean {
  if (buf.length < PDF_MAGIC.length) return false;
  const window = buf.subarray(0, Math.min(buf.length, PDF_HEADER_SCAN_WINDOW));
  return window.toString("latin1").includes(PDF_MAGIC);
}
