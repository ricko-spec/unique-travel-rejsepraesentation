// Admin — "Oprettet af" i rejsepræsentationslisten (Issue #67). Ren,
// unit-testbar mapping-logik, adskilt fra src/app/admin/api/trips/route.ts
// (samme mønster som evaluateRateLimit/checkRateLimit-adskillelsen i
// rate-limit.ts) — så selve navnevalget kan testes uden Supabase-klienten.

// Kun de felter vi rent faktisk skal bruge — bevidst IKKE hele Profile-typen
// fra profiles.ts. Route'en selecter kun disse tre kolonner, og hverken
// profil-id'et eller emailen sendes videre til klienten (kun det afledte navn).
export type CreatorProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/**
 * De unikke, non-null created_by-id'er fra en liste af trips — grundlaget for
 * ÉT samlet profiles-opslag (`in("id", ...)`) i stedet for ét opslag pr. trip.
 */
export function uniqueCreatorIds(createdByValues: Array<string | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const value of createdByValues) {
    if (value) ids.add(value);
  }
  return [...ids];
}

/**
 * full_name → fallback email → ellers null. Ældre trips med created_by=null,
 * og creator-id'er uden en matchende profil-række, giver begge null (vises
 * som "—" i admin-UI'et) — aldrig en fejl.
 */
export function resolveCreatedByName(
  createdBy: string | null | undefined,
  profiles: CreatorProfile[],
): string | null {
  if (!createdBy) return null;

  const profile = profiles.find((p) => p.id === createdBy);
  if (!profile) return null;

  const fullName = profile.full_name?.trim();
  if (fullName) return fullName;

  const email = profile.email?.trim();
  return email || null;
}

/**
 * Erstatter `created_by` (intern uuid — sendes aldrig til klienten) med det
 * afledte `created_by_name` på hver række. Rækkefølge og øvrige felter er
 * uændrede.
 */
export function withCreatedByName<T extends { created_by: string | null | undefined }>(
  rows: T[],
  profiles: CreatorProfile[],
): Array<Omit<T, "created_by"> & { created_by_name: string | null }> {
  return rows.map(({ created_by, ...rest }) => ({
    ...rest,
    created_by_name: resolveCreatedByName(created_by, profiles),
  }));
}
