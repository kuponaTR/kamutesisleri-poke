import { describe, it, expect } from "vitest";
import { detectTrafficAnomaly, detectSeoDrop, uptimeTransition } from "./alerts";

describe("detectTrafficAnomaly", () => {
  it("eşik aşılınca anomali döner", () => {
    const r = detectTrafficAnomaly(1200, 6300, 40)!;
    expect(r.changePct).toBe(-81);
    expect(r.direction).toBe("down");
  });
  it("eşik altındaysa null", () => {
    expect(detectTrafficAnomaly(6500, 6300, 40)).toBe(null);
  });
  it("baseline 0 ise null", () => {
    expect(detectTrafficAnomaly(10, 0, 40)).toBe(null);
  });
});

describe("detectSeoDrop", () => {
  it("eşikten fazla düşüşte drop", () => {
    expect(detectSeoDrop(5000, 7200, 30)!.changePct).toBe(-31);
  });
  it("az düşüşte null", () => {
    expect(detectSeoDrop(7000, 7200, 30)).toBe(null);
  });
  it("önceki 0 ise null", () => {
    expect(detectSeoDrop(100, 0, 30)).toBe(null);
  });
});

describe("uptimeTransition", () => {
  it("up->down", () => expect(uptimeTransition("up", false)).toBe("down"));
  it("down->up", () => expect(uptimeTransition("down", true)).toBe("recovered"));
  it("değişim yoksa null", () => expect(uptimeTransition("up", true)).toBe(null));
  it("ilk kez down ise down", () => expect(uptimeTransition(null, false)).toBe("down"));
  it("ilk kez up ise null", () => expect(uptimeTransition(null, true)).toBe(null));
});
