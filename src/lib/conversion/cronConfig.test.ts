// Gate D6 (Issue #89) — kontrakt for den daglige Vercel Cron (vercel.json).
// Beviser at cron-konfigurationen (1) kun kalder den eksisterende, CRON_SECRET-
// beskyttede sync-route, (2) overholder Hobby-planens regler (højst én kørsel
// pr. døgn, fast klokkeslæt i UTC, ingen navne-syntaks), og (3) hænger sammen
// med STALE-alarmen, så én forsinket kørsel ikke giver falsk alarm, mens én
// helt udeblevet kørsel altid bliver synlig i admin.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STALE_AFTER_HOURS } from "./contract";

const ROOT = process.cwd();
const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  $schema?: string;
  crons?: { path: string; schedule: string }[];
};

const SYNC_PATH = "/api/internal/conversion/sync";

describe("vercel.json — daglig cron for konverteringsmålingen", () => {
  it("indeholder kun schema + præcis én cron (ingen utilsigtede projektændringer)", () => {
    expect(Object.keys(config).sort()).toEqual(["$schema", "crons"]);
    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
    expect(config.crons).toHaveLength(1);
  });

  it("kalder den eksisterende sync-route, som er beskyttet af CRON_SECRET og kun svarer i production", () => {
    const cron = config.crons![0];
    expect(cron.path).toBe(SYNC_PATH);
    const routeFile = join(ROOT, "src", "app", ...SYNC_PATH.split("/").filter(Boolean), "route.ts");
    expect(existsSync(routeFile)).toBe(true);
    const route = readFileSync(routeFile, "utf8");
    // Vercel Cron kalder med GET; routen skal eksportere GET og bruge CRON_SECRET-handleren.
    expect(route).toMatch(/export async function GET\(/);
    expect(route).toContain("CRON_SECRET: process.env.CRON_SECRET");
    expect(route).toContain("handleConversionSyncRequest");
  });

  it("kører dagligt kl. 03:00 UTC — gyldigt på Hobby (højst én kørsel pr. døgn, ingen navne/intervaller)", () => {
    const fields = config.crons![0].schedule.split(" ");
    expect(fields).toHaveLength(5);
    const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
    expect(minute).toBe("0");
    expect(hour).toBe("3");
    // Én kørsel pr. døgn: faste tal for minut/time, '*' for resten (Vercel: dag-i-måned og
    // ugedag må ikke begge være sat; navne som MON/JAN understøttes ikke).
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
    for (const f of [minute, hour]) expect(f).toMatch(/^\d+$/);
  });

  it("STALE-alarmen (36 t) tåler Hobby-præcisionen (±59 min), men fanger én udeblevet kørsel", () => {
    // Værste afstand mellem to rettidige Hobby-kørsler: 24 t + op til 59 min forsinkelse.
    const worstOnTimeGapHours = 24 + 1;
    // Én udeblevet kørsel: seneste succes er ≥ 48 t gammel, før den næste lykkes.
    const oneMissedRunGapHours = 48;
    expect(STALE_AFTER_HOURS).toBeGreaterThan(worstOnTimeGapHours);
    expect(STALE_AFTER_HOURS).toBeLessThan(oneMissedRunGapHours);
  });
});
