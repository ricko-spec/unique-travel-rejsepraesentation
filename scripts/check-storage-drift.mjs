// Drift-tjek: sammenligner de faktiske Supabase Storage-bucket-egenskaber
// med den committede kontrakt i supabase/storage-baseline.json. Lukker
// ROADMAP's kendte blindvinkel — bucket-config lever i Storage-API'et, ikke
// i Postgres, og fanges derfor IKKE af check-schema-drift.mjs.
//
// Brug:
//   node scripts/check-storage-drift.mjs                    # tjek (exit 1 ved drift)
//   node scripts/check-storage-drift.mjs --update-baseline  # gem live-snapshot som ny baseline
//
// READ-ONLY: kalder udelukkende GET /storage/v1/bucket/{name} (Supabase
// Storage Admin API via service-role-nøglen fra .env.local — samme
// credential-kilde check-schema-drift.mjs allerede bruger til Postgres,
// ingen nye credentials). Opretter/ændrer/sletter ALDRIG en bucket eller et
// objekt.
//
// Kontrollerer kun de bucket-egenskaber appen faktisk afhænger af (se
// src/app/admin/api/destinations/upload-url/route.ts og finalize-upload/
// route.ts): public-status, file_size_limit, allowed_mime_types. Støjende
// metadata (id, owner, created_at, updated_at, type) er bevidst udeladt —
// se scripts/lib/storage-drift.mjs for selve sammenligningslogikken
// (ren, testet i storage-drift.test.mjs, ingen netværksafhængighed).
//
// Arbejdsgang ved en bevidst bucket-config-ændring (fx nyt size-limit):
//   1) Lav ændringen i Supabase Dashboard → Storage → bucket-indstillinger
//   2) node scripts/check-storage-drift.mjs --update-baseline
//   3) Commit den opdaterede supabase/storage-baseline.json
//
// Exit-koder: 0 = ingen drift · 1 = drift fundet · 2 = fejl (env/net/API)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { canonicalizeBucket, diffAllBuckets } from "./lib/storage-drift.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASELINE_PATH = join(ROOT, "supabase", "storage-baseline.json");

// De eneste bucket-navne appen faktisk bruger (verificeret via
// `grep -rn "\.storage\.from(" src/` — kun "destinations" i dag). Nye
// buckets skal tilføjes her bevidst, ikke auto-opdages, så drift-tjekket
// aldrig stille begynder at afhænge af noget ingen kode rører.
const EXPECTED_BUCKET_NAMES = ["destinations"];

class SetupError extends Error {}

function loadEnv() {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function fetchLiveBucketsByName(supabase) {
  const byName = new Map();
  for (const name of EXPECTED_BUCKET_NAMES) {
    const { data, error } = await supabase.storage.getBucket(name);
    if (error) {
      // "not found" er reel, rapporterbar drift — andre fejl (auth/netværk/
      // rate-limit) er et opsætningsproblem, ikke drift, og skal give exit 2.
      if (/not.*found/i.test(error.message ?? "")) continue;
      throw new SetupError(`storage.getBucket("${name}") fejlede: ${error.message}`);
    }
    byName.set(name, canonicalizeBucket(data));
  }
  return byName;
}

async function main() {
  const update = process.argv.includes("--update-baseline");
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new SetupError(
      "Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local",
    );
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const host = new URL(url).host;

  const liveByName = await fetchLiveBucketsByName(supabase);

  if (update) {
    const buckets = EXPECTED_BUCKET_NAMES.filter((n) => liveByName.has(n))
      .sort()
      .map((n) => liveByName.get(n));
    writeFileSync(BASELINE_PATH, JSON.stringify({ buckets }, null, 2) + "\n", "utf8");
    console.log(`Baseline opdateret fra ${host} → supabase/storage-baseline.json`);
    console.log(`  buckets: ${buckets.length}`);
    console.log("Husk at committe baselinen sammen med den bevidste bucket-config-ændring.");
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    throw new SetupError(
      "Ingen baseline fundet (supabase/storage-baseline.json).\n" +
        "Kør først: node scripts/check-storage-drift.mjs --update-baseline",
    );
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")).buckets ?? [];

  const report = diffAllBuckets(baseline, liveByName);

  if (report.length > 0) {
    for (const { name, mismatches } of report) {
      console.log(`\n[${name}]`);
      for (const m of mismatches) console.log(`  ÆNDRING: ${m}`);
    }
    console.log(`\nDRIFT FUNDET mod ${host}.`);
    console.log("Er ændringen bevidst? Kør derefter");
    console.log("  node scripts/check-storage-drift.mjs --update-baseline");
    process.exitCode = 1;
    return;
  }
  console.log(`Ingen drift — Storage-buckets (${host}) matcher supabase/storage-baseline.json.`);
}

// process.exitCode (ikke process.exit) — samme begrundelse som
// check-schema-drift.mjs: et hårdt exit mens supabase-js' keep-alive-sockets
// stadig er åbne crasher node på Windows og ødelægger exit-koden.
main().catch((e) => {
  if (e instanceof SetupError) {
    console.error(e.message);
  } else {
    console.error("Storage-drift-tjek fejlede:", e);
  }
  process.exitCode = 2;
});
