import { formatShortSha } from "@/lib/build-info";

// Issue #57 (PAIN-1): diskret build-identifikator for admin. Server
// component — process.env læses og formateres udelukkende server-side, kun
// den korte, allerede-sanitiserede SHA-streng når klienten (aldrig et
// env-objekt, aldrig andre Vercel-variable). VERCEL_GIT_COMMIT_SHA er
// Vercels dokumenterede system-env-variabel (build + runtime), se
// https://vercel.com/docs/environment-variables/system-environment-variables
// — kræver at "Enable system environment variables" er slået til i
// projektindstillingerne; er den ikke det, eller kører vi lokalt, er
// variablen tom og komponenten viser intet (ingen fejl, mindst støjende
// løsning, jf. issuens eget krav).
export function VersionBadge() {
  const sha = formatShortSha(process.env.VERCEL_GIT_COMMIT_SHA);
  if (!sha) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 10,
        fontSize: 10,
        color: "var(--grey-text)",
        opacity: 0.55,
        letterSpacing: "0.04em",
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      Version {sha}
    </div>
  );
}
