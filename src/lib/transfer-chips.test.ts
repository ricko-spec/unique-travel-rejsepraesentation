import { describe, it, expect } from "vitest";
import { transferChipMode, stripRedundantTransferChips } from "./transfer-chips";

// Alle strenge er faktiske chips fra production (sep. 2026).
const seaplaneTransfer = {
  type: "transfer",
  title: "Vandflyver: Malé lufthavn → Resort",
  details: "Rejsetid: 35 min",
  chips: ["Vandflyver", "35 min", "Bagagebegrænsning"],
};
const speedboatTransfer = {
  type: "transfer",
  title: "Speedbåd · Malé lufthavn → Resort",
  details: "Speedbåd fra Malé lufthavn til resortet · ca. 45 minutters sejltur",
  chips: ["Speedbåd", "45 min", "Inkluderet"],
};

describe("transferChipMode", () => {
  it("genkender de fire faktiske transport-chips", () => {
    expect(transferChipMode("Vandflyver-ø")).toBe("seaplane");
    expect(transferChipMode("Vandflyver t/r")).toBe("seaplane");
    expect(transferChipMode("Vandflyver-adgang")).toBe("seaplane");
    expect(transferChipMode("Speedbåd inkl.")).toBe("speedboat");
  });

  it("almindelige hotel-chips er ikke transport", () => {
    for (const c of [
      "Morgenmad",
      "7 nætter",
      "Deluxe værelse",
      "All Inclusive",
      "Early Check-In",
      "Water Pool Villa",
      "Ekstra opredning",
      "Bangkok",
    ]) {
      expect(transferChipMode(c)).toBeNull();
    }
  });

  it("fritekst der blot nævner transport er ikke en transport-chip", () => {
    // Længdegrænsen holder sætninger ude, så reelle oplysninger ikke forsvinder
    expect(transferChipMode("Gå fra pier til og fra hotellet ca. 600m")).toBeNull();
    expect(transferChipMode("Hotellet henter jer ved færgelejet")).toBeNull();
  });

  it("tom og manglende chip giver null", () => {
    expect(transferChipMode("")).toBeNull();
    expect(transferChipMode(null)).toBeNull();
    expect(transferChipMode(undefined)).toBeNull();
  });
});

describe("stripRedundantTransferChips", () => {
  it("fjerner vandflyver-chippen naar transferen staar i rejseplanen", () => {
    const out = stripRedundantTransferChips([
      seaplaneTransfer,
      { type: "hotel", chips: ["All Inclusive", "7 nætter", "Sangu Water Villa", "Vandflyver-adgang"] },
    ]);
    expect(out[1].chips).toEqual(["All Inclusive", "7 nætter", "Sangu Water Villa"]);
  });

  it("fjerner speedbaad-chippen paa samme vilkaar", () => {
    const out = stripRedundantTransferChips([
      speedboatTransfer,
      { type: "hotel", chips: ["Helpension", "10 nætter", "Grand Water Villa", "Speedbåd inkl."] },
    ]);
    expect(out[1].chips).toEqual(["Helpension", "10 nætter", "Grand Water Villa"]);
  });

  it("BEVARER chippen hvis rejsen ikke har et transfer-element med samme form", () => {
    const items = [
      { type: "flight", chips: ["SK123"] },
      { type: "hotel", chips: ["7 nætter", "Vandflyver-adgang"] },
    ];
    expect(stripRedundantTransferChips(items)[1].chips).toEqual(["7 nætter", "Vandflyver-adgang"]);
  });

  it("en speedbaad-transfer fjerner ikke en vandflyver-chip", () => {
    const out = stripRedundantTransferChips([
      speedboatTransfer,
      { type: "hotel", chips: ["7 nætter", "Vandflyver-adgang"] },
    ]);
    expect(out[1].chips).toEqual(["7 nætter", "Vandflyver-adgang"]);
  });

  it("transfer-elementets egne chips roeres aldrig", () => {
    const out = stripRedundantTransferChips([
      seaplaneTransfer,
      { type: "hotel", chips: ["Vandflyver t/r"] },
    ]);
    expect(out[0].chips).toEqual(["Vandflyver", "35 min", "Bagagebegrænsning"]);
    expect(out[0]).toBe(seaplaneTransfer); // uændret objekt
  });

  it("hoteller uden transport-chips returneres som samme objekt", () => {
    const hotel = { type: "hotel", chips: ["Morgenmad", "4 nætter"] };
    const out = stripRedundantTransferChips([seaplaneTransfer, hotel]);
    expect(out[1]).toBe(hotel);
  });

  it("rejser helt uden transfer-elementer returneres uaendret", () => {
    const items = [{ type: "hotel", chips: ["Morgenmad", "Vandflyver-ø"] }];
    expect(stripRedundantTransferChips(items)).toBe(items);
  });

  it("hotel uden chips haandteres uden fejl", () => {
    const out = stripRedundantTransferChips([
      seaplaneTransfer,
      { type: "hotel" },
      { type: "hotel", chips: [] },
    ]);
    expect(out).toHaveLength(3);
  });
});
