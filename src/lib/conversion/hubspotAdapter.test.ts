import { describe, expect, it } from "vitest";
import { createFixtureHubSpotAdapter, fixtureObservation } from "./hubspotAdapter";

function deal(id: string) {
  return fixtureObservation({
    rawDealId: id,
    everQualifiedAt: null,
    bookingNumberRaw: null,
    dealStatusRaw: null,
    hubspotClosed: false,
    hubspotClosedWon: false,
    closedAtRaw: null,
  });
}

describe("createFixtureHubSpotAdapter", () => {
  it("confirmStageContract() er ok, når contractOk ikke er sat til false", async () => {
    const adapter = createFixtureHubSpotAdapter({ deals: [] });
    expect(await adapter.confirmStageContract()).toEqual({ ok: true });
  });

  it("confirmStageContract() fejler, når contractOk=false — simulerer kontraktdrift", async () => {
    const adapter = createFixtureHubSpotAdapter({ deals: [], contractOk: false });
    const result = await adapter.confirmStageContract();
    expect(result.ok).toBe(false);
  });

  it("paginerer i faste sider uden huller eller dubletter", async () => {
    const deals = Array.from({ length: 25 }, (_, i) => deal(`d${i}`));
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 10 });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page = await adapter.readDealsPage(cursor);
      if (!page.ok) throw new Error("uventet fejl");
      seen.push(...page.observations.map((o) => o.rawDealId));
      if (!page.hasMore) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(deals.map((d) => d.rawDealId));
    expect(new Set(seen).size).toBe(25); // ingen dubletter
  });

  it("sidste side har hasMore=false og nextCursor=null", async () => {
    const deals = Array.from({ length: 5 }, (_, i) => deal(`d${i}`));
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 10 });
    const page = await adapter.readDealsPage(null);
    if (!page.ok) throw new Error("uventet fejl");
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("kan simulere en fejl på en bestemt side", async () => {
    const deals = Array.from({ length: 25 }, (_, i) => deal(`d${i}`));
    const adapter = createFixtureHubSpotAdapter({
      deals,
      pageSize: 10,
      failOnPageIndex: 1,
      failReason: "http-429",
    });
    const first = await adapter.readDealsPage(null);
    expect(first.ok).toBe(true);
    const second = await adapter.readDealsPage("1");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("http-429");
  });
});
