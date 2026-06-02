// Engangs-backfill: sætter advisorEmail + advisorPhone på eksisterende trips
// ud fra profiles.advisor_match_name (case-insensitivt match mod trip.data.advisor).
//
// Brug:
//   node scripts/backfill-advisor-contacts.mjs            # DRY RUN (skriver intet)
//   node scripts/backfill-advisor-contacts.mjs --apply    # udfører UPDATE
//
// Læser NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY fra .env.local.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

const norm = (s) => (s ?? "").trim().toLowerCase();

async function main() {
  const apply = process.argv.includes("--apply");
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const host = new URL(url).host;
  console.log(`\n${apply ? "APPLY" : "DRY RUN"} — Supabase: ${host}\n`);

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("email, phone, advisor_match_name");
  if (pErr) throw pErr;

  const profileByName = new Map();
  for (const p of profiles ?? []) {
    if (p.advisor_match_name) profileByName.set(norm(p.advisor_match_name), p);
  }
  console.log(`Profiler med advisor_match_name: ${profileByName.size}`);

  const { data: trips, error: tErr } = await supabase
    .from("trips")
    .select("id, booking_no, data")
    .order("created_at", { ascending: true });
  if (tErr) throw tErr;

  console.log(`Trips i alt: ${trips?.length ?? 0}\n`);

  let matched = 0;
  let unmatched = 0;
  let willChange = 0;
  const unmatchedAdvisors = new Map();

  for (const t of trips ?? []) {
    const advisor = (t.data?.advisor ?? "").trim();
    const p = profileByName.get(norm(advisor));
    const newEmail = p?.email ?? null;
    const newPhone = p?.phone ?? null;
    const curEmail = t.data?.advisorEmail ?? null;
    const curPhone = t.data?.advisorPhone ?? null;
    const changes = newEmail !== curEmail || newPhone !== curPhone;

    if (p) matched++;
    else {
      unmatched++;
      unmatchedAdvisors.set(advisor || "(tom)", (unmatchedAdvisors.get(advisor || "(tom)") ?? 0) + 1);
    }

    const tag = p ? "MATCH" : "ingen ";
    const change = changes ? (apply ? "→ opdateres" : "→ ville ændres") : "(uændret)";
    console.log(
      `  #${String(t.booking_no).padEnd(7)} ${tag}  advisor="${advisor}"  email=${newEmail ?? "null"}  phone=${newPhone ?? "null"}  ${change}`,
    );

    if (changes) {
      willChange++;
      if (apply) {
        const newData = { ...t.data, advisorEmail: newEmail, advisorPhone: newPhone };
        const { error: uErr } = await supabase.from("trips").update({ data: newData }).eq("id", t.id);
        if (uErr) {
          console.error(`    FEJL ved #${t.booking_no}: ${uErr.message}`);
        }
      }
    }
  }

  console.log(`\nOpsummering:`);
  console.log(`  Trips med matchende profil: ${matched}`);
  console.log(`  Trips uden match:           ${unmatched}`);
  console.log(`  ${apply ? "Opdateret" : "Ville ændre"}:               ${willChange}`);
  if (unmatchedAdvisors.size) {
    console.log(`\nAdvisor-navne uden profil (opret en profil med advisor_match_name for at koble dem):`);
    for (const [name, count] of [...unmatchedAdvisors.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${name} (${count} trip${count === 1 ? "" : "s"})`);
    }
  }
  if (!apply) {
    console.log(`\nDette var en DRY RUN. Kør med --apply for at skrive ændringerne.`);
  }
  console.log("");
}

main().catch((e) => {
  console.error("Backfill fejlede:", e);
  process.exit(1);
});
