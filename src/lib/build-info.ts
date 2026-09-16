// Issue #57: formaterer en git-commit-SHA til en kort, sikker
// build-identifikator for admin. Ren funktion — ingen Next.js-/env-adgang
// her, så den er direkte testbar. Selve process.env-opslaget sker i
// src/app/admin/VersionBadge.tsx (server component, aldrig sendt til klienten
// som et env-objekt — kun den allerede-formaterede streng renders).

const SHA_RE = /^[0-9a-f]{7,40}$/i;

/**
 * Returnerer en 7-tegns kort SHA, eller null hvis input mangler/er
 * tomt/ikke ligner en git-SHA. Aldrig en fejl — kaldestedet viser intet i
 * stedet, jf. Issue #57 ("ingen fejl, vælg den mindst støjende løsning").
 */
export function formatShortSha(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!SHA_RE.test(trimmed)) return null;
  return trimmed.slice(0, 7);
}
