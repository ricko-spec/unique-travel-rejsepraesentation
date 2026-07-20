// Drift-tjek: sammenligner den levende Supabase-DBs DDL-metadata med den
// committede baseline i supabase/schema-baseline.json.
//
// Brug:
//   node scripts/check-schema-drift.mjs                    # tjek (exit 1 ved drift)
//   node scripts/check-schema-drift.mjs --update-baseline  # gem live-snapshot som ny baseline
//
// Arbejdsgang ved bevidste skema-ændringer:
//   1) Skriv ny migration supabase/NNN_*.sql og kør den i SQL Editor/MCP
//   2) node scripts/check-schema-drift.mjs --update-baseline
//   3) Commit migrationen + supabase/schema-baseline.json i samme commit
//
// Kræver public.schema_snapshot() (supabase/008_schema_snapshot.sql).
// Læser NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY fra .env.local.
//
// Exit-koder: 0 = ingen drift · 1 = drift fundet · 2 = fejl (env/net/RPC)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASELINE_PATH = join(ROOT, "supabase", "schema-baseline.json");

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

// Kanonisk serialisering: nøgler sorteres rekursivt så diffen er stabil
// uanset hvilken vej JSON'en er kommet ind.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}

// Menneske-læsbar etiket for en entry i hver sektion.
function label(section, entry) {
  switch (section) {
    case "columns":     return `${entry.table}.${entry.column}`;
    case "policies":    return `${entry.table} · "${entry.policy}"`;
    case "indexes":     return entry.name;
    case "constraints": return `${entry.table} · ${entry.name}`;
    case "functions":   return `${entry.name}()`;
    case "triggers":    return `${entry.table} · ${entry.name}`;
    case "comments":    return entry.column ? `${entry.table}.${entry.column}` : `${entry.table} (tabel)`;
    default:            return JSON.stringify(entry);
  }
}

function diffSection(section, baselineArr, liveArr) {
  const key = (e) => JSON.stringify(canonical(e));
  const baseMap = new Map(baselineArr.map((e) => [key(e), e]));
  const liveMap = new Map(liveArr.map((e) => [key(e), e]));

  const missing = [...baseMap.entries()].filter(([k]) => !liveMap.has(k)).map(([, e]) => e);
  const added   = [...liveMap.entries()].filter(([k]) => !baseMap.has(k)).map(([, e]) => e);
  return { missing, added };
}

// Fejl der skal give exit-kode 2 (setup/net/RPC) frem for 1 (drift).
class SetupError extends Error {}

async function fetchSnapshot() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new SetupError("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local");
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("schema_snapshot");
  if (error) {
    throw new SetupError(
      `schema_snapshot() fejlede: ${error.message}\n` +
        "Er migration supabase/008_schema_snapshot.sql kørt på databasen?",
    );
  }
  return { snapshot: canonical(data), host: new URL(url).host };
}

async function main() {
  const update = process.argv.includes("--update-baseline");
  const { snapshot, host } = await fetchSnapshot();

  if (update) {
    writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    const counts = Object.entries(snapshot)
      .map(([k, v]) => `${k}: ${v.length}`)
      .join(" · ");
    console.log(`Baseline opdateret fra ${host} → supabase/schema-baseline.json`);
    console.log(`  ${counts}`);
    console.log("Husk at committe baselinen sammen med den migration der ændrede skemaet.");
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    throw new SetupError(
      "Ingen baseline fundet (supabase/schema-baseline.json).\n" +
        "Kør først: node scripts/check-schema-drift.mjs --update-baseline",
    );
  }
  const baseline = canonical(JSON.parse(readFileSync(BASELINE_PATH, "utf8")));

  let driftFound = false;
  const sections = new Set([...Object.keys(baseline), ...Object.keys(snapshot)]);

  for (const section of [...sections].sort()) {
    const baseArr = baseline[section] ?? [];
    const liveArr = snapshot[section] ?? [];
    const { missing, added } = diffSection(section, baseArr, liveArr);
    if (missing.length === 0 && added.length === 0) continue;

    driftFound = true;
    console.log(`\n[${section}]`);
    for (const e of missing) {
      console.log(`  - MANGLER i live DB (findes i baseline): ${label(section, e)}`);
    }
    for (const e of added) {
      console.log(`  + NYT/ÆNDRET i live DB (ikke i baseline): ${label(section, e)}`);
    }
    // En ændring optræder som et - og et + med samme etiket; vis detaljen.
    const missingByLabel = new Map(missing.map((e) => [label(section, e), e]));
    for (const e of added) {
      const twin = missingByLabel.get(label(section, e));
      if (twin) {
        console.log(`    ÆNDRING i ${label(section, e)}:`);
        console.log(`      baseline: ${JSON.stringify(twin)}`);
        console.log(`      live:     ${JSON.stringify(e)}`);
      }
    }
  }

  if (driftFound) {
    console.log(`\nDRIFT FUNDET mod ${host}.`);
    console.log("Er ændringen bevidst? Skriv en ny migration i supabase/ og kør derefter");
    console.log("  node scripts/check-schema-drift.mjs --update-baseline");
    process.exitCode = 1;
    return;
  }
  console.log(`Ingen drift — live DB (${host}) matcher supabase/schema-baseline.json.`);
}

// process.exitCode (ikke process.exit): et hårdt exit mens supabase-js'
// keep-alive-sockets stadig er åbne crasher node på Windows (libuv-assertion)
// og ødelægger exit-koden. Med exitCode lukker processen naturligt.
main().catch((e) => {
  if (e instanceof SetupError) {
    console.error(e.message);
  } else {
    console.error("Drift-tjek fejlede:", e);
  }
  process.exitCode = 2;
});
