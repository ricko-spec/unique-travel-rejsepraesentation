import { describe, expect, it } from "vitest";
import { createFixtureHubSpotAdapter, fixtureObservation } from "./hubspotAdapter";

const deal = (id: string) => fixtureObservation({ rawDealId: id });

describe("createFixtureHubSpotAdapter", () => {
  it("confirmStageContract() returnerer pipeline og den komplette live stage-liste", async () => {
    const adapter = createFixtureHubSpotAdapter({ deals: [], stages: ["a", "b"] });
    expect(await adapter.confirmStageContract()).toEqual({ ok: true, pipelineId: "754595640", stageIds: ["a", "b"] });
  });

  it("confirmStageContract() kan simulere en HTTP-fejl på metadata-kaldet", async () => {
    const adapter = createFixtureHubSpotAdapter({ deals: [], contractFailure: "http-403" });
    expect(await adapter.confirmStageContract()).toEqual({ ok: false, reason: "http-403" });
  });

  it("paginerer i faste sider uden huller eller dubletter, med samme total på hver side", async () => {
    const deals = Array.from({ length: 25 }, (_, i) => deal(`d${i}`));
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 10 });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page = await adapter.readDealsPage(cursor);
      if (!page.ok) throw new Error("uventet fejl");
      expect(page.total).toBe(25);
      seen.push(...page.observations.map((o) => o.rawDealId));
      if (!page.hasMore) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(deals.map((d) => d.rawDealId));
  });

  it("sidste side har hasMore=false og nextCursor=null", async () => {
    const adapter = createFixtureHubSpotAdapter({ deals: [deal("a")], pageSize: 10 });
    const page = await adapter.readDealsPage(null);
    expect(page).toMatchObject({ ok: true, hasMore: false, nextCursor: null });
  });

  it("kan simulere en fejl på en bestemt side — kun med kategorisk årsag, ingen besked", async () => {
    const deals = Array.from({ length: 25 }, (_, i) => deal(`d${i}`));
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 10, failOnPageIndex: 1, failReason: "http-429" });
    expect((await adapter.readDealsPage(null)).ok).toBe(true);
    expect(await adapter.readDealsPage("1")).toEqual({ ok: false, reason: "http-429" });
  });

  it("fixtureObservation har kun snapshot-felter — ingen historik eller closedate", () => {
    expect(Object.keys(deal("x")).sort()).toEqual(
      ["bookingNumberRaw", "dealStageId", "dealStatusRaw", "hubspotClosed", "hubspotClosedWon", "pipelineId", "rawDealId"].sort(),
    );
  });
});
