# Faz 2 — Proaktif Uyarı + Akıllı Özet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Poke'a günlük trendli akıllı özet + trafik/site/SEO proaktif uyarıları gönderen zeka katmanı.

**Architecture:** İki cron (günlük digest+alerts, 15 dk uptime). Saf anomali mantığı vitest ile; cron akışı `wrangler dev` scheduled tetikleme + Poke doğrulama gönderimi ile. KV ile uptime durum saklama.

**Tech Stack:** TypeScript, Cloudflare Workers (cron + KV), vitest, GA4/Search Console/Meta/Notion API, Poke inbound API.

**Spec:** `docs/superpowers/specs/2026-06-13-faz2-proaktif-uyari-akilli-ozet-design.md`

---

## Task 1: KV namespace + env/vars + poke.ts

**Files:** `wrangler.jsonc`, `src/types.ts`, `src/lib/poke.ts` (yeni), `src/lib/sync.ts`

- [ ] **Step 1:** `npx wrangler kv namespace create STATE` → dönen id'yi `wrangler.jsonc`'a `kv_namespaces` binding olarak ekle (`{ binding: "STATE", id: "..." }`).
- [ ] **Step 2:** `wrangler.jsonc` `triggers.crons`'a `"*/15 * * * *"` ekle; `vars`'a `TRAFFIC_ANOMALY_PCT:"40"`, `SEO_DROP_PCT:"30"`, `SLOW_MS:"5000"`.
- [ ] **Step 3:** `src/types.ts` `Env`'e: `STATE: KVNamespace;`, `TRAFFIC_ANOMALY_PCT: string;`, `SEO_DROP_PCT: string;`, `SLOW_MS: string;`.
- [ ] **Step 4:** `src/lib/poke.ts` oluştur: `export async function sendPoke(env, message): Promise<boolean>` — POKE_API_KEY yoksa false; varsa poke.com inbound'a POST, ok döner. `sync.ts`'teki `notifyPoke` gövdesindeki fetch mantığını buraya taşı.
- [ ] **Step 5:** `npx tsc --noEmit` → 0. Commit: "feat: KV STATE + 15dk cron + eşik vars + poke.ts sendPoke".

## Task 2: Saf anomali fonksiyonları + testler

**Files:** `src/lib/alerts.ts` (yeni), `src/lib/alerts.test.ts` (yeni)

- [ ] **Step 1:** `alerts.test.ts` yaz:
```ts
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
  it("baseline 0 ise null", () => { expect(detectTrafficAnomaly(10, 0, 40)).toBe(null); });
});
describe("detectSeoDrop", () => {
  it("eşikten fazla düşüşte drop", () => { expect(detectSeoDrop(5000, 7200, 30)!.changePct).toBe(-31); });
  it("az düşüşte null", () => { expect(detectSeoDrop(7000, 7200, 30)).toBe(null); });
  it("önceki 0 ise null", () => { expect(detectSeoDrop(100, 0, 30)).toBe(null); });
});
describe("uptimeTransition", () => {
  it("up->down", () => { expect(uptimeTransition("up", false)).toBe("down"); });
  it("down->up", () => { expect(uptimeTransition("down", true)).toBe("recovered"); });
  it("değişim yoksa null", () => { expect(uptimeTransition("up", true)).toBe(null); });
  it("ilk kez down ise down", () => { expect(uptimeTransition(null, false)).toBe("down"); });
  it("ilk kez up ise null", () => { expect(uptimeTransition(null, true)).toBe(null); });
});
```
- [ ] **Step 2:** `npm test -- src/lib/alerts.test.ts` → FAIL.
- [ ] **Step 3:** `alerts.ts`'e saf fonksiyonları yaz:
```ts
export function detectTrafficAnomaly(yesterday: number, prior7Avg: number, pct: number) {
  if (!prior7Avg) return null;
  const changePct = Math.round(((yesterday - prior7Avg) / prior7Avg) * 100);
  if (Math.abs(changePct) < pct) return null;
  return { changePct, direction: changePct < 0 ? "down" as const : "up" as const, yesterday, prior7Avg };
}
export function detectSeoDrop(thisWeek: number, prevWeek: number, pct: number) {
  if (!prevWeek) return null;
  const changePct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
  if (changePct > -pct) return null;
  return { changePct, thisWeek, prevWeek };
}
export function uptimeTransition(prev: "up" | "down" | null, currentOk: boolean) {
  const cur = currentOk ? "up" : "down";
  if (prev === cur) return null;
  if (cur === "down") return "down" as const;
  if (prev === "down") return "recovered" as const;
  return null; // null->up
}
```
- [ ] **Step 4:** `npm test -- src/lib/alerts.test.ts` → PASS. Commit: "feat: saf anomali/transition fonksiyonları + testler".

## Task 3: GA4 günlük seri

**Files:** `src/lib/google.ts`

- [ ] **Step 1:** `getGa4DailyUsers(env, days=8): Promise<{date:string;activeUsers:number}[]>` ekle — runReport, dimension `date`, metric `activeUsers`, son `days` gün, tarihe göre sıralı.
- [ ] **Step 2:** Canlı doğrula (curl/node): son 8 günün günlük kullanıcı serisi gelir.
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit: "feat: getGa4DailyUsers (anomali için günlük seri)".

## Task 4: runUptimeCheck + runDailyAlerts

**Files:** `src/lib/alerts.ts`

- [ ] **Step 1:** `runUptimeCheck(env)`:
```ts
import { scanWebsite } from "./scanner";
import { sendPoke } from "./poke";
export async function runUptimeCheck(env: Env): Promise<void> {
  let ok = false, detail = "";
  try {
    const r = await scanWebsite(env.SITE_URL);
    ok = r.status === 200 && r.responseTimeMs < Number(env.SLOW_MS ?? 5000);
    detail = `HTTP ${r.status}, ${r.responseTimeMs}ms`;
  } catch (e) { detail = e instanceof Error ? e.message : String(e); }
  const prev = (await env.STATE.get("site:status")) as "up" | "down" | null;
  const t = uptimeTransition(prev, ok);
  await env.STATE.put("site:status", ok ? "up" : "down");
  if (t === "down") await sendPoke(env, `🔴 UYARI: kamutesisleri.com erişilemiyor (${detail}).`);
  else if (t === "recovered") await sendPoke(env, `🟢 kamutesisleri.com tekrar erişilebilir (${detail}).`);
}
```
- [ ] **Step 2:** `runDailyAlerts(env): Promise<string[]>` — GA4 günlük seri → dün vs prior7avg → detectTrafficAnomaly; GSC son7g vs önceki7g (getSearchConsoleReport iki çağrı, totals.clicks) → detectSeoDrop. Bulunan uyarı satırlarını döndür; boş değilse sendPoke.
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit: "feat: runUptimeCheck (KV durum) + runDailyAlerts (trafik+SEO)".

## Task 5: buildDigest + get_digest aracı

**Files:** `src/lib/digest.ts` (yeni), `src/index.ts`

- [ ] **Step 1:** `buildDigest(env): Promise<{message:string; data:any}>` — GA4 dün+trend, AdSense/AdMob dün, GSC haftalık vs önceki, IG takipçi + getSocialGrowth; her parça `tryCall`; başarısız satır atlanır. Türkçe formatlı `message`.
- [ ] **Step 2:** `index.ts`'e `get_digest` aracı (girdi yok) → `buildDigest`.
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit: "feat: buildDigest + get_digest aracı".

## Task 6: scheduled() dallanması + notifyPoke kaldırma

**Files:** `src/index.ts`, `src/lib/sync.ts`

- [ ] **Step 1:** `sync.ts`'ten `notifyPoke` kaldır (mantık poke.ts + cron'a taşındı). `index.ts` importunu güncelle.
- [ ] **Step 2:** `index.ts` `scheduled()`:
```ts
async scheduled(event, env, ctx) {
  if (event.cron === "*/15 * * * *") { ctx.waitUntil(runUptimeCheck(env)); return; }
  ctx.waitUntil((async () => {
    await runFullSync(env);
    const d = await buildDigest(env); await sendPoke(env, d.message);
    const alerts = await runDailyAlerts(env);
    if (alerts.length) await sendPoke(env, alerts.join("\n"));
  })());
}
```
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit: "feat: scheduled cron dallanması (günlük digest+alerts / 15dk uptime)".

## Task 7: Yerel doğrulama (scheduled tetikleme) + smoke test

**Files:** `scripts/mcp-smoke-test.mjs`

- [ ] **Step 1:** smoke test `tests`'e `["get_digest", {}]` ekle.
- [ ] **Step 2:** `wrangler dev` → `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"` (uptime) ve `?cron=30+5+*+*+*` (digest) ile her iki dalı tetikle; loglarda mesaj üretimini doğrula. `get_digest`'i smoke test ile çağır.
- [ ] **Step 3:** Poke'a tek doğrulama gönderimi (digest) gerçekten ulaşıyor mu kontrol et (POKE_API_KEY ile).
- [ ] **Step 4:** Commit: "test: get_digest smoke + yerel scheduled doğrulama".

## Task 8: Deploy + production doğrulama + push + hafıza

- [ ] **Step 1:** `npm test` (tüm birim) → PASS. `npx wrangler deploy`.
- [ ] **Step 2:** Production smoke test (`get_digest` dahil 12 araç) → OK.
- [ ] **Step 3:** Production'da uptime cron'unu manuel tetikle (deploy sonrası ilk KV durumu yazılır) — opsiyonel; veya ilk gerçek 15dk tetiklemesini bekle.
- [ ] **Step 4:** `git push origin main`. Hafıza güncelle (Faz 2 eklendi, KV STATE, iki cron, eşik vars).

## Self-Review
- Spec kapsamı: digest (Task 5), get_digest (Task 5), uptime alert (Task 4/1-KV), trafik+SEO alert (Task 4/3), iki cron (Task 1/6) — tümü karşılanıyor.
- SSL kapsam dışı (spec kararı) — plana dahil değil, tutarlı.
- Tip tutarlılığı: detectTrafficAnomaly/detectSeoDrop/uptimeTransition/getGa4DailyUsers/runUptimeCheck/runDailyAlerts/buildDigest/sendPoke adları tutarlı.
