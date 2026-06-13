import { describe, it, expect } from "vitest";
import { computeDelta } from "./growth";

describe("computeDelta", () => {
  it("mutlak ve yüzde farkı hesaplar", () => {
    expect(computeDelta(110, 100)).toEqual({ current: 110, previous: 100, deltaAbs: 10, deltaPct: 10 });
  });
  it("önceki yoksa null yüzde", () => {
    expect(computeDelta(110, null)).toEqual({ current: 110, previous: null, deltaAbs: null, deltaPct: null });
  });
  it("önceki 0 ise yüzde null (bölme yok)", () => {
    expect(computeDelta(5, 0).deltaPct).toBe(null);
  });
});
