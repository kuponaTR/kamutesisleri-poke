import { describe, it, expect } from "vitest";
import { mapSearchConsole } from "./google";

describe("mapSearchConsole", () => {
  it("totals + rows'u sade biçime çevirir, ctr'yi yüzdeye çevirir", () => {
    const api = {
      rows: [
        { keys: ["otel"], clicks: 100, impressions: 1000, ctr: 0.1, position: 3.2 },
        { keys: ["kamp"], clicks: 50, impressions: 800, ctr: 0.0625, position: 5.1 },
      ],
    };
    const r = mapSearchConsole(api, "query");
    expect(r.totals.clicks).toBe(150);
    expect(r.totals.impressions).toBe(1800);
    expect(r.rows[0]).toEqual({ key: "otel", clicks: 100, impressions: 1000, ctr: 10, position: 3.2 });
  });
  it("boş yanıtta sıfır totals döner", () => {
    const r = mapSearchConsole({}, "page");
    expect(r.totals).toEqual({ clicks: 0, impressions: 0 });
    expect(r.rows).toEqual([]);
  });
});
