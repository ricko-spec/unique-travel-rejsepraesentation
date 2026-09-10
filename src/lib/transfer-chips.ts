// Kundevendt oprydning af transport-chips på hotel-elementer i rejseplanen.
// Kaldes fra normalizeTrip i src/lib/types.ts, så både nye og allerede gemte
// rejser renses ved render — ingen re-upload, ingen migration, rå data urørt.
//
// Baggrund: på nogle Maldiverne-rejser hænger transporten som en chip på selve
// hotel-elementet ("Vandflyver-adgang", "Speedbåd inkl."), samtidig med at
// turen står som fuldt beskrevne transfer-elementer begge veje — med egen
// titel, rejsetid og "Inkluderet". Chippen på hotellet gentager altså noget
// rejseplanen allerede fortæller bedre.
//
// Chippen fjernes KUN når rejseplanen faktisk indeholder et transfer-element
// med samme transportform. Findes transferen ikke andetsteds, bevares chippen,
// så ingen transportoplysning kan forsvinde.

// Minimal strukturel type — undgår import fra types.ts (cirkulær import).
type ChipItem = {
  type?: string | null;
  chips?: string[] | null;
  title?: string | null;
  details?: string | null;
};

const MODES: { key: string; re: RegExp }[] = [
  { key: "seaplane", re: /vandflyver|sea\s?plane/i },
  { key: "speedboat", re: /speedb[åa]d|speed\s?boat/i },
  { key: "ferry", re: /f[æa]rge|ferry/i },
];

// Kun chips der ER en transportangivelse, ikke fritekst der nævner transport.
// De fire faktiske i production er "Vandflyver-ø", "Vandflyver t/r",
// "Vandflyver-adgang" og "Speedbåd inkl." — alle korte og med formen forrest.
// Længdegrænsen holder sætninger som "Gå fra pier til hotellet ca. 600m" ude.
const CHIP_STARTS_WITH_MODE =
  /^(vandflyver|sea\s?plane|speedb[åa]d|speed\s?boat|f[æa]rge|ferry)\b/i;
const MAX_CHIP_LEN = 24;

/** Transportformen en chip angiver, eller null hvis den ikke er en ren transport-chip. */
export function transferChipMode(chip: string | null | undefined): string | null {
  const s = (chip ?? "").trim();
  if (!s || s.length > MAX_CHIP_LEN || !CHIP_STARTS_WITH_MODE.test(s)) return null;
  return MODES.find((m) => m.re.test(s))?.key ?? null;
}

/** Transportformer der er dækket af et rigtigt transfer-element i rejseplanen. */
function modesCoveredByTransfers(items: ChipItem[]): Set<string> {
  const covered = new Set<string>();
  for (const it of items) {
    if (it.type !== "transfer") continue;
    const haystack = [it.title ?? "", it.details ?? "", ...(it.chips ?? [])].join(" ");
    for (const m of MODES) if (m.re.test(haystack)) covered.add(m.key);
  }
  return covered;
}

export function stripRedundantTransferChips<T extends ChipItem>(items: T[]): T[] {
  const covered = modesCoveredByTransfers(items);
  if (covered.size === 0) return items;
  return items.map((it) => {
    if (it.type !== "hotel" || !it.chips?.length) return it;
    const kept = it.chips.filter((c) => {
      const mode = transferChipMode(c);
      return mode === null || !covered.has(mode);
    });
    return kept.length === it.chips.length ? it : { ...it, chips: kept };
  });
}
