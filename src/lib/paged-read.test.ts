import { describe, it, expect, vi } from "vitest";
import { readAllRows, type PageRequest, type PageResponse } from "./paged-read";

// En falsk PostgREST-tabel med `total` rækker og et server-loft (`max_rows`), der
// afkorter STILLE — præcis den fælde readAllRows() skal undgå.
function fakeTable(total: number, serverCap: number, opts: { failAtPage?: number } = {}) {
  const all = Array.from({ length: total }, (_, i) => ({ i }));
  const calls: PageRequest[] = [];
  const fetchPage = vi.fn(async (req: PageRequest): Promise<PageResponse<{ i: number }>> => {
    calls.push(req);
    if (opts.failAtPage !== undefined && calls.length === opts.failAtPage) {
      return { data: null, error: { message: "boom" }, count: null };
    }
    const want = req.to - req.from + 1;
    const slice = all.slice(req.from, req.from + Math.min(want, serverCap));
    return { data: slice, error: null, count: req.withCount ? total : null };
  });
  return { fetchPage, calls };
}

describe("readAllRows — korrekt fuldstændig læsning", () => {
  it("tom tabel => ok, ingen rækker, én side", async () => {
    const { fetchPage } = fakeTable(0, 1000);
    const r = await readAllRows(fetchPage);
    expect(r).toEqual({ ok: true, rows: [], pages: 1 });
  });

  it("mindre end én side => én forespørgsel", async () => {
    const { fetchPage } = fakeTable(267, 1000);
    const r = await readAllRows(fetchPage);
    expect(r.ok && r.rows.length).toBe(267);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("2 500 rækker med 1000-loft => alle 2 500, tre sider, ingen dubletter/huller", async () => {
    const { fetchPage } = fakeTable(2500, 1000);
    const r = await readAllRows(fetchPage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2500);
    expect(r.pages).toBe(3);
    expect(r.rows.map((x) => x.i)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it("præcis 1000 og præcis 2000 rækker (grænsetilfælde)", async () => {
    for (const n of [1000, 2000, 1001]) {
      const { fetchPage } = fakeTable(n, 1000);
      const r = await readAllRows(fetchPage);
      expect(r.ok && r.rows.length).toBe(n);
    }
  });

  it("server-loft LAVERE end sidestørrelsen (500 < 1000) afkorter IKKE tavst", async () => {
    const { fetchPage, calls } = fakeTable(1800, 500);
    const r = await readAllRows(fetchPage); // beder om 1000, får 500 pr. side
    expect(r.ok && r.rows.length).toBe(1800);
    // Næste offset er antal FAKTISK modtagne rækker, ikke sidestørrelsen.
    expect(calls.map((c) => c.from)).toEqual([0, 500, 1000, 1500]);
  });

  it("kun første side beder om eksakt count", async () => {
    const { calls, fetchPage } = fakeTable(2500, 1000);
    await readAllRows(fetchPage);
    expect(calls.map((c) => c.withCount)).toEqual([true, false, false]);
  });

  it("antallet af forespørgsler afhænger af rækker/sidestørrelse, ALDRIG af antal 'trips' pr. række", async () => {
    const small = fakeTable(500, 1000);
    const big = fakeTable(2500, 1000);
    await readAllRows(small.fetchPage);
    await readAllRows(big.fetchPage);
    expect(small.fetchPage).toHaveBeenCalledTimes(1);
    expect(big.fetchPage).toHaveBeenCalledTimes(3);
  });
});

describe("readAllRows — fejl og afkortning bliver aldrig 'tom'", () => {
  it("fejl på første side => ok:false (aldrig tom liste)", async () => {
    const { fetchPage } = fakeTable(10, 1000, { failAtPage: 1 });
    const r = await readAllRows(fetchPage);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("rows");
  });

  it("fejl på en SENERE side kasserer hele resultatet (ingen delvis liste udleveres)", async () => {
    const { fetchPage } = fakeTable(2500, 1000, { failAtPage: 2 });
    const r = await readAllRows(fetchPage);
    expect(r).toMatchObject({ ok: false, reason: "error" });
    expect(r).not.toHaveProperty("rows");
  });

  it("manglende count => ok:false 'no-count' (kan ikke verificere fuldstændighed)", async () => {
    const r = await readAllRows(async () => ({ data: [{ i: 1 }], error: null, count: null }));
    expect(r).toMatchObject({ ok: false, reason: "no-count" });
  });

  it("tom side før total er nået (server afkorter til 0) => 'truncated'", async () => {
    let n = 0;
    const r = await readAllRows(async () => {
      n += 1;
      return n === 1
        ? { data: [{ i: 0 }, { i: 1 }], error: null, count: 5 }
        : { data: [], error: null, count: null };
    });
    expect(r).toMatchObject({ ok: false, reason: "truncated" });
  });

  it("kaster fetchPage, returneres ok:false — der propageres aldrig en exception", async () => {
    const r = await readAllRows(async () => {
      throw new TypeError("netværk");
    });
    expect(r).toMatchObject({ ok: false, reason: "error" });
  });

  it("sikkerhedsloft mod uendelig løkke => 'too-many-pages'", async () => {
    const r = await readAllRows(async () => ({ data: [{ i: 1 }], error: null, count: 1_000_000 }), {
      pageSize: 1,
      maxPages: 5,
    });
    expect(r).toMatchObject({ ok: false, reason: "too-many-pages" });
  });
});
