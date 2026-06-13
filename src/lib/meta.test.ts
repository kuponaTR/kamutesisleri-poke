import { describe, it, expect } from "vitest";
import { computeEngagementRate } from "./meta";

describe("computeEngagementRate", () => {
  it("etkileşimi reach'e böler ve yüzdeye çevirir", () => {
    expect(computeEngagementRate(50, 10, 40, 1000)).toBeCloseTo(10, 5); // (50+10+40)/1000*100
  });
  it("reach 0 ise 0 döner (bölme hatası yok)", () => {
    expect(computeEngagementRate(5, 5, 0, 0)).toBe(0);
  });
});
