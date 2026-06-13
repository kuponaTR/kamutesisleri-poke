import { describe, it, expect } from "vitest";
import { computeEngagementRate, analyzePostingTimes } from "./meta";

describe("computeEngagementRate", () => {
  it("etkileşimi reach'e böler ve yüzdeye çevirir", () => {
    expect(computeEngagementRate(50, 10, 40, 1000)).toBeCloseTo(10, 5); // (50+10+40)/1000*100
  });
  it("reach 0 ise 0 döner (bölme hatası yok)", () => {
    expect(computeEngagementRate(5, 5, 0, 0)).toBe(0);
  });
});

describe("analyzePostingTimes", () => {
  it("gönderileri haftanın gününe ve saate göre gruplar (UTC)", () => {
    const posts = [
      { timestamp: "2026-06-08T09:30:00+0000" }, // Pazartesi 09
      { timestamp: "2026-06-08T09:45:00+0000" }, // Pazartesi 09
      { timestamp: "2026-06-09T20:00:00+0000" }, // Salı 20
    ];
    const r = analyzePostingTimes(posts);
    expect(r.byWeekday["Pazartesi"]).toBe(2);
    expect(r.byHour["9"]).toBe(2);
    expect(r.byHour["20"]).toBe(1);
  });
});
