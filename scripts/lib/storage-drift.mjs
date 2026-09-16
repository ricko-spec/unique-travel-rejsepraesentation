// Rene, testbare dele af Storage-bucket-drift-tjekket — ingen Supabase-kald
// eller filsystem-adgang her. Selve netværks-/CLI-delen ligger i
// scripts/check-storage-drift.mjs, som importerer disse funktioner.
//
// Bevidst snævert: vi sammenligner KUN de bucket-egenskaber appen faktisk
// afhænger af (se src/app/admin/api/destinations/upload-url/route.ts og
// finalize-upload/route.ts) — public-status, file_size_limit,
// allowed_mime_types. Støjende metadata (id, owner, created_at, updated_at,
// type) indgår bevidst ikke, så de aldrig kan udløse en falsk drift-alarm.

/** Reducerer en rå Storage API-bucket til kun de produktkritiske felter. */
export function canonicalizeBucket(bucket) {
  return {
    name: bucket.name,
    public: bucket.public,
    file_size_limit: bucket.file_size_limit ?? null,
    allowed_mime_types: [...(bucket.allowed_mime_types ?? [])].sort(),
  };
}

/**
 * Sammenligner én forventet (baseline) bucket-kontrakt mod én live-læst,
 * kanonisk bucket. Returnerer en liste af menneskelæsbare mismatch-linjer —
 * tom liste betyder ingen drift. `live` er `undefined`/`null` når bucketen
 * ikke findes live.
 */
export function diffBucket(expected, live) {
  if (!live) return [`bucket "${expected.name}" findes ikke live`];

  const mismatches = [];
  if (live.public !== expected.public) {
    mismatches.push(`public: baseline=${expected.public} live=${live.public}`);
  }
  if (live.file_size_limit !== expected.file_size_limit) {
    mismatches.push(
      `file_size_limit: baseline=${expected.file_size_limit} live=${live.file_size_limit}`,
    );
  }
  const expMimes = JSON.stringify([...(expected.allowed_mime_types ?? [])].sort());
  const liveMimes = JSON.stringify([...(live.allowed_mime_types ?? [])].sort());
  if (expMimes !== liveMimes) {
    mismatches.push(`allowed_mime_types: baseline=${expMimes} live=${liveMimes}`);
  }
  return mismatches;
}

/**
 * Kører diffBucket for hver forventet bucket i baseline mod et kort af
 * live-bucketnavn → kanonisk bucket. Returnerer kun de buckets der reelt
 * afviger, som { name, mismatches }.
 */
export function diffAllBuckets(baselineBuckets, liveBucketsByName) {
  const report = [];
  for (const expected of baselineBuckets) {
    const mismatches = diffBucket(expected, liveBucketsByName.get(expected.name));
    if (mismatches.length > 0) report.push({ name: expected.name, mismatches });
  }
  return report;
}
