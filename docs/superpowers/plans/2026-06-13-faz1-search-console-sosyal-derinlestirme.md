# Faz 1 — Search Console + Sosyal Derinleştirme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP sunucusuna Search Console raporu + Instagram post/büyüme + Facebook sayfa metrikleri için 4 yeni araç eklemek.

**Architecture:** Saf hesaplama mantığı ayrı, vitest ile birim test edilir; API adaptörleri canlı API doğrulaması + MCP smoke test ile doğrulanır. `instagram.ts` → `meta.ts` olarak konsolide edilir. Sosyal taraf mevcut süresiz Page token'ı kullanır (yeni kimlik gerekmez); Search Console mevcut Google OAuth altyapısını + yeni bir scope kullanır.

**Tech Stack:** TypeScript, Cloudflare Workers (`agents`/MCP SDK), Zod, vitest (yeni), Google APIs (Search Console v3), Meta Graph API v21.0, Notion API.

**Spec:** `docs/superpowers/specs/2026-06-13-faz1-search-console-sosyal-derinlestirme-design.md`

**Deployment sırası:** Bölüm A (sosyal, kimlik gerektirmez) tamamen canlıya alınır, sonra Bölüm B (Search Console, scope+enable gerektirir).

---

## Task 0: Test altyapısı (vitest)

**Files:**
- Modify: `package.json` (devDependency + script)
- Create: `vitest.config.ts`

- [ ] **Step 1: vitest kur**

Run: `npm i -D vitest`
Expected: vitest devDependencies'e eklenir.

- [ ] **Step 2: vitest config oluştur**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });
```

- [ ] **Step 3: package.json'a test script ekle**

`"scripts"` içine: `"test": "vitest run"`

- [ ] **Step 4: Boş çalıştırma**

Run: `npm test`
Expected: "No test files found" veya 0 test — hata yok.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: vitest kurulumu (saf mantık birim testleri için)"
```

---

# BÖLÜM A — SOSYAL DERİNLEŞTİRME

## Task 1: `instagram.ts` → `meta.ts` konsolidasyonu

**Files:**
- Rename: `src/lib/instagram.ts` → `src/lib/meta.ts`
- Modify: `src/index.ts` (import), `src/lib/sync.ts` (import)

- [ ] **Step 1: Dosyayı taşı**

Run: `git mv src/lib/instagram.ts src/lib/meta.ts`

- [ ] **Step 2: Ortak yardımcı ekle (meta.ts başına)**

`meta.ts` içine, mevcut `getInstagramInsights`'tan önce:
```ts
const GRAPH = "https://graph.facebook.com/v21.0";

async function metaGet(env: Env, path: string, params: Record<string, string>): Promise<any> {
  if (!env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN tanımlı değil.");
  const qs = new URLSearchParams({ ...params, access_token: env.META_ACCESS_TOKEN });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const body = (await res.json()) as any;
  if (!res.ok) throw new Error(`Meta API hatası ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  return body;
}
```

- [ ] **Step 3: importları güncelle**

`src/index.ts`: `from "./lib/instagram"` → `from "./lib/meta"`.
`src/lib/sync.ts`: `from "./instagram"` → `from "./meta"`.

- [ ] **Step 4: Tip kontrolü**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: hata yok.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: instagram.ts -> meta.ts konsolidasyonu + metaGet yardımcısı"
```

---

## Task 2: Engagement oranı (saf fonksiyon + test)

**Files:**
- Modify: `src/lib/meta.ts`
- Test: `src/lib/meta.test.ts`

- [ ] **Step 1: Failing test yaz**

`src/lib/meta.test.ts`:
```ts
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
```

- [ ] **Step 2: Test başarısız olmalı**

Run: `npm test -- src/lib/meta.test.ts`
Expected: FAIL — `computeEngagementRate` export edilmemiş.

- [ ] **Step 3: Implementasyon**

`meta.ts`:
```ts
export function computeEngagementRate(likes: number, comments: number, saved: number, reach: number): number {
  if (!reach) return 0;
  return Math.round(((likes + comments + saved) / reach) * 1000) / 10;
}
```

- [ ] **Step 4: Test geçmeli**

Run: `npm test -- src/lib/meta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta.ts src/lib/meta.test.ts
git commit -m "feat: computeEngagementRate saf fonksiyonu + testleri"
```

---

## Task 3: Paylaşım saati analizi (saf fonksiyon + test)

**Files:**
- Modify: `src/lib/meta.ts`, `src/lib/meta.test.ts`

- [ ] **Step 1: Failing test ekle**

`meta.test.ts`'e:
```ts
import { analyzePostingTimes } from "./meta";

describe("analyzePostingTimes", () => {
  it("gönderileri haftanın gününe ve sadate göre gruplar (UTC)", () => {
    const posts = [
      { timestamp: "2026-06-08T09:30:00+0000" }, // Pazartesi 09
      { timestamp: "2026-06-08T09:45:00+0000" }, // Pazartesi 09
      { timestamp: "2026-06-09T20:00:00+0000" }, // Salı 20
    ];
    const r = analyzePostingTimes(posts as any);
    expect(r.byWeekday["Pazartesi"]).toBe(2);
    expect(r.byHour["9"]).toBe(2);
    expect(r.byHour["20"]).toBe(1);
  });
});
```

- [ ] **Step 2: Test başarısız olmalı**

Run: `npm test -- src/lib/meta.test.ts`
Expected: FAIL — `analyzePostingTimes` yok.

- [ ] **Step 3: Implementasyon**

`meta.ts`:
```ts
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export function analyzePostingTimes(posts: { timestamp: string }[]): {
  byWeekday: Record<string, number>;
  byHour: Record<string, number>;
} {
  const byWeekday: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  for (const p of posts) {
    const d = new Date(p.timestamp);
    const wd = WEEKDAYS[d.getUTCDay()];
    const hr = String(d.getUTCHours());
    byWeekday[wd] = (byWeekday[wd] ?? 0) + 1;
    byHour[hr] = (byHour[hr] ?? 0) + 1;
  }
  return { byWeekday, byHour };
}
```

- [ ] **Step 4: Test geçmeli**

Run: `npm test -- src/lib/meta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta.ts src/lib/meta.test.ts
git commit -m "feat: analyzePostingTimes saf fonksiyonu + testleri"
```

---

## Task 4: `getInstagramPosts` adaptörü + canlı doğrulama

**Files:**
- Modify: `src/lib/meta.ts`
- Create: `scripts/verify-ig-posts.mjs` (geçici doğrulama)

- [ ] **Step 1: Implementasyon**

`meta.ts`:
```ts
export interface InstagramPost {
  permalink: string; type: string; timestamp: string; caption: string;
  likes: number; comments: number; saved: number; reach: number; engagementRate: number;
}

export async function getInstagramPosts(env: Env, limit = 12): Promise<{
  account: string; posts: InstagramPost[];
  bestPosts: InstagramPost[]; postingTimes: ReturnType<typeof analyzePostingTimes>;
}> {
  const ig = env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!ig) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID tanımlı değil.");
  const media = await metaGet(env, `${ig}/media`, {
    fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  const posts: InstagramPost[] = [];
  for (const m of media.data ?? []) {
    let reach = 0, saved = 0;
    try {
      const ins = await metaGet(env, `${m.id}/insights`, { metric: "reach,saved" });
      for (const d of ins.data ?? []) {
        const v = d.values?.[0]?.value ?? 0;
        if (d.name === "reach") reach = v; else if (d.name === "saved") saved = v;
      }
    } catch { /* insights bazı medya tiplerinde yok; atla */ }
    const likes = m.like_count ?? 0, comments = m.comments_count ?? 0;
    posts.push({
      permalink: m.permalink, type: m.media_type, timestamp: m.timestamp,
      caption: (m.caption ?? "").slice(0, 120),
      likes, comments, saved, reach,
      engagementRate: computeEngagementRate(likes, comments, saved, reach),
    });
  }
  const bestPosts = [...posts].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 3);
  return { account: media.data?.[0] ? "kamutesisleri" : "kamutesisleri", posts, bestPosts, postingTimes: analyzePostingTimes(posts) };
}
```

- [ ] **Step 2: Canlı doğrulama scripti**

`scripts/verify-ig-posts.mjs` — `.dev.vars`'tan token okuyup son 5 gönderiyi çeker, `reach`/`engagementRate` alanlarının dolu geldiğini yazdırır. (Token'ı yazdırma.)

- [ ] **Step 3: Çalıştır ve doğrula**

Run: `set -a; . ./.dev.vars; set +a; node scripts/verify-ig-posts.mjs`
Expected: 5 gönderi, her birinde permalink + sayısal reach/engagementRate.

- [ ] **Step 4: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta.ts scripts/verify-ig-posts.mjs
git commit -m "feat: getInstagramPosts (post bazında insights + en iyiler + saat analizi)"
```

---

## Task 5: `getFacebookPageInsights` adaptörü + FB_PAGE_ID config

**Files:**
- Modify: `src/lib/meta.ts`, `src/types.ts`, `wrangler.jsonc`

- [ ] **Step 1: Env + var ekle**

`src/types.ts` `Env`'e: `FB_PAGE_ID: string;` ve `GSC_SITE_URL: string;`
`wrangler.jsonc` `vars`'a: `"FB_PAGE_ID": "1004566529413415"` (GSC_SITE_URL Bölüm B'de doldurulacak, şimdilik `""`).

- [ ] **Step 2: Implementasyon**

`meta.ts`:
```ts
export interface FacebookPageSummary {
  page: string; followers: number; reach: number; engagements: number; period: string;
}

export async function getFacebookPageInsights(env: Env, period = "week"): Promise<FacebookPageSummary> {
  const pid = env.FB_PAGE_ID;
  if (!pid) throw new Error("FB_PAGE_ID tanımlı değil.");
  const prof = await metaGet(env, pid, { fields: "name,followers_count,fan_count" });
  let reach = 0, engagements = 0;
  try {
    const ins = await metaGet(env, `${pid}/insights`, {
      metric: "page_impressions_unique,page_post_engagements", period,
    });
    for (const d of ins.data ?? []) {
      const v = d.values?.at(-1)?.value ?? 0;
      if (d.name === "page_impressions_unique") reach = v;
      else if (d.name === "page_post_engagements") engagements = v;
    }
  } catch { /* metrik sürüm bağımlı; gracefully 0 bırak */ }
  return {
    page: prof.name, followers: prof.followers_count ?? prof.fan_count ?? 0,
    reach, engagements, period,
  };
}
```

- [ ] **Step 3: Canlı doğrulama**

Run: `set -a; . ./.dev.vars; set +a; node -e "import('./src/lib/meta.ts')"` yerine doğrudan curl ile:
`GET /1004566529413415?fields=name,followers_count` ve `/insights?metric=page_impressions_unique,page_post_engagements&period=week` → ad + sayısal değerler döner. (Page token ile.)
Expected: sayfa adı "Kamu Tesisleri" + sayısal reach/engagement.

- [ ] **Step 4: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta.ts src/types.ts wrangler.jsonc
git commit -m "feat: getFacebookPageInsights + FB_PAGE_ID/GSC_SITE_URL env"
```

---

## Task 6: Büyüme hesabı (saf fonksiyon + test) + `getSocialGrowth`

**Files:**
- Create: `src/lib/growth.ts`, `src/lib/growth.test.ts`
- Modify: `src/lib/notion.ts` (getRecentRecords zaten var; IG/FB alanlarını döndürmesi için genişlet)

- [ ] **Step 1: Failing test**

`src/lib/growth.test.ts`:
```ts
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
```

- [ ] **Step 2: Test başarısız olmalı**

Run: `npm test -- src/lib/growth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasyon**

`src/lib/growth.ts`:
```ts
export interface Delta { current: number; previous: number | null; deltaAbs: number | null; deltaPct: number | null; }
export function computeDelta(current: number, previous: number | null): Delta {
  if (previous == null) return { current, previous: null, deltaAbs: null, deltaPct: null };
  const deltaAbs = current - previous;
  const deltaPct = previous === 0 ? null : Math.round((deltaAbs / previous) * 1000) / 10;
  return { current, previous, deltaAbs, deltaPct };
}
```

- [ ] **Step 4: Test geçmeli**

Run: `npm test -- src/lib/growth.test.ts`
Expected: PASS.

- [ ] **Step 5: getSocialGrowth + notion alanları**

`src/lib/notion.ts` `getRecentRecords` map'ine ekle:
```ts
igFollowers: p["IG Takipçi"]?.number ?? null,
igReach: p["IG Reach"]?.number ?? null,
fbReach: p["FB Reach"]?.number ?? null,
```
`src/lib/growth.ts`:
```ts
import type { Env } from "../types";
import { getRecentRecords } from "./notion";
export async function getSocialGrowth(env: Env, days = 7) {
  const recs = await getRecentRecords(env, days + 1);
  const cur = recs[0] ?? {}; const prev = recs[Math.min(days, recs.length - 1)] ?? {};
  return {
    igFollowers: computeDelta(cur.igFollowers ?? 0, prev.igFollowers ?? null),
    igReach: computeDelta(cur.igReach ?? 0, prev.igReach ?? null),
    fbReach: computeDelta(cur.fbReach ?? 0, prev.fbReach ?? null),
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/growth.ts src/lib/growth.test.ts src/lib/notion.ts
git commit -m "feat: computeDelta + getSocialGrowth (Notion snapshot'ından büyüme)"
```

---

## Task 7: Notion DB kolon migrasyonu (IG/FB)

**Files:**
- Create: `scripts/migrate-notion-social-columns.mjs`

- [ ] **Step 1: Idempotent migrasyon scripti**

`scripts/migrate-notion-social-columns.mjs` — `GET /databases/{id}` ile mevcut propertyleri okur; "IG Takipçi"/"IG Reach"/"FB Reach" yoksa `PATCH /databases/{id}` ile number olarak ekler. (NOTION_API_KEY + NOTION_DATABASE_ID env'den.)

- [ ] **Step 2: Çalıştır**

Run: `set -a; . ./.env; set +a; node scripts/migrate-notion-social-columns.mjs`
Expected: "eklendi" veya "zaten var" — hata yok.

- [ ] **Step 3: Doğrula (tekrar çalıştır, idempotent)**

Run: aynı komut
Expected: "zaten var".

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-notion-social-columns.mjs
git commit -m "feat: Notion sosyal kolon migrasyon scripti (idempotent)"
```

---

## Task 8: `createStatsRecord` + `runFullSync` sosyal alanları

**Files:**
- Modify: `src/lib/notion.ts` (StatsRecord + createStatsRecord), `src/lib/sync.ts`

- [ ] **Step 1: StatsRecord alanları**

`notion.ts` `StatsRecord`'a: `igFollowers?: number; igReach?: number; fbReach?: number;`
`createStatsRecord` properties bloğuna:
```ts
if (record.igFollowers != null) properties["IG Takipçi"] = { number: record.igFollowers };
if (record.igReach != null) properties["IG Reach"] = { number: record.igReach };
if (record.fbReach != null) properties["FB Reach"] = { number: record.fbReach };
```

- [ ] **Step 2: runFullSync FB insights + snapshot**

`sync.ts`: `getInstagramInsights` zaten var; `getFacebookPageInsights` ekle (`tryCall`). `createStatsRecord` çağrısına:
```ts
igFollowers: instagram.ok ? instagram.data.followersCount : undefined,
igReach: instagram.ok ? (instagram.data.reachLastDay ?? undefined) : undefined,
fbReach: fb.ok ? fb.data.reach : undefined,
```
`notifyPoke` satırlarına sosyal özet ekle (instagram.ok ise).

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notion.ts src/lib/sync.ts
git commit -m "feat: günlük senkronizasyona IG/FB snapshot + Poke sosyal özeti"
```

---

## Task 9: 3 sosyal aracı index.ts'e kaydet

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: importlar**

`from "./lib/meta"`: `getInstagramPosts, getFacebookPageInsights` ekle. `from "./lib/growth"`: `getSocialGrowth`.

- [ ] **Step 2: tool kayıtları**

`get_instagram_posts` (limit: z.number().int().min(1).max(25).optional), `get_facebook_page_insights` (period: z.enum(["day","week","days_28"]).optional), `get_social_growth` (days: z.number().int().min(1).max(90).optional). Her biri mevcut `text`/`errorText` deseniyle.

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: get_instagram_posts, get_facebook_page_insights, get_social_growth araçları"
```

---

## Task 10: Smoke test genişlet + yerel & production doğrulama (Bölüm A)

**Files:**
- Modify: `scripts/mcp-smoke-test.mjs`

- [ ] **Step 1: Smoke test'e yeni araçları ekle**

`tests` dizisine: `["get_instagram_posts", {limit:5}]`, `["get_facebook_page_insights", {}]`, `["get_social_growth", {days:7}]`.

- [ ] **Step 2: Yerel doğrulama**

Run: `npx wrangler dev --port 8787` (arka plan) → `MCP_API_KEY=... node scripts/mcp-smoke-test.mjs`
Expected: tüm araçlar [OK] (get_social_growth ilk gün previous:null olabilir — hata değil).

- [ ] **Step 3: Deploy**

Run: `npx wrangler deploy`
Expected: başarılı.

- [ ] **Step 4: Production doğrulama**

Run: `MCP_BASE=https://kamutesisleri-poke-mcp.studioplx.workers.dev/mcp MCP_API_KEY=... node scripts/mcp-smoke-test.mjs`
Expected: 10 araç ([OK]/anlamlı), Instagram posts + FB page gerçek veri.

- [ ] **Step 5: Commit**

```bash
git add scripts/mcp-smoke-test.mjs
git commit -m "test: smoke test'e sosyal araçları ekle; Bölüm A canlı doğrulandı"
```

---

# BÖLÜM B — SEARCH CONSOLE

## Task 11: Google token'a webmasters scope'u ekle (kullanıcı onayı)

**Files:**
- Modify: `scripts/get-refresh-token.mjs`

- [ ] **Step 1: SCOPES'a ekle**

`scripts/get-refresh-token.mjs` SCOPES dizisine: `"https://www.googleapis.com/auth/webmasters.readonly"`.

- [ ] **Step 2: OAuth akışını çalıştır**

Claude callback sunucusunu başlatır + tarayıcıda auth URL'i açar; **kullanıcı 4 izni (analytics+adsense+admob+webmasters) onaylar**. Yeni refresh token yakalanır.

- [ ] **Step 3: Search Console API'yi etkinleştir**

Console: `https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=uyecekme` → Enable.

- [ ] **Step 4: Token'ı API düzeyinde doğrula**

`GET https://searchconsole.googleapis.com/webmasters/v3/sites` → property listesi döner; doğru property (`sc-domain:kamutesisleri.com` veya url-prefix) tespit edilir.

- [ ] **Step 5: Secret güncelle + .dev.vars/.env**

Run: `printf '%s' "<yeni token>" | npx wrangler secret put GOOGLE_REFRESH_TOKEN`; yerel dosyalar güncellenir.

- [ ] **Step 6: Commit**

```bash
git add scripts/get-refresh-token.mjs
git commit -m "feat: refresh token akışına webmasters.readonly scope'u"
```

---

## Task 12: Search Console satır eşleme (saf fonksiyon + test)

**Files:**
- Create: `src/lib/google.test.ts`
- Modify: `src/lib/google.ts`

- [ ] **Step 1: Failing test**

`src/lib/google.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Test başarısız olmalı**

Run: `npm test -- src/lib/google.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasyon**

`google.ts`:
```ts
export function mapSearchConsole(api: any, dimension: string) {
  const rows = (api.rows ?? []).map((r: any) => ({
    key: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0,
    ctr: Math.round((r.ctr ?? 0) * 1000) / 10, position: Math.round((r.position ?? 0) * 10) / 10,
  }));
  const totals = rows.reduce((a: any, r: any) => ({
    clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions,
  }), { clicks: 0, impressions: 0 });
  return { dimension, totals, rows };
}
```

- [ ] **Step 4: Test geçmeli**

Run: `npm test -- src/lib/google.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google.ts src/lib/google.test.ts
git commit -m "feat: mapSearchConsole saf fonksiyonu + testleri"
```

---

## Task 13: `getSearchConsoleReport` adaptörü

**Files:**
- Modify: `src/lib/google.ts`

- [ ] **Step 1: Implementasyon**

`google.ts`:
```ts
export async function getSearchConsoleReport(
  env: Env, startDate?: string, endDate?: string, dimension = "query", rowLimit = 10
) {
  const end = endDate ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const start = startDate ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const site = encodeURIComponent(env.GSC_SITE_URL);
  const data = await googleJson<any>(env,
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify({ startDate: start, endDate: end, dimensions: [dimension], rowLimit }) }
  );
  return { startDate: start, endDate: end, ...mapSearchConsole(data, dimension) };
}
```

- [ ] **Step 2: Canlı doğrulama**

Run: yeni token ile curl `searchAnalytics/query` → gerçek sorgular döner.
Expected: en az 1 satır, key + clicks/impressions/position.

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/lib/google.ts
git commit -m "feat: getSearchConsoleReport adaptörü"
```

---

## Task 14: `get_search_console_report` aracı + GSC_SITE_URL

**Files:**
- Modify: `src/index.ts`, `wrangler.jsonc`

- [ ] **Step 1: GSC_SITE_URL doldur**

`wrangler.jsonc` `vars`: `"GSC_SITE_URL"` = tespit edilen property (ör. `"sc-domain:kamutesisleri.com"`).

- [ ] **Step 2: tool kaydı**

`src/index.ts`: `get_search_console_report` (startDate?, endDate?, dimension enum, rowLimit 1-25), `getSearchConsoleReport` çağırır.

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts wrangler.jsonc
git commit -m "feat: get_search_console_report aracı + GSC_SITE_URL"
```

---

## Task 15: Final doğrulama + smoke test (Bölüm B) + temizlik

**Files:**
- Modify: `scripts/mcp-smoke-test.mjs`; geçici verify scriptleri silinir

- [ ] **Step 1: Smoke test'e ekle**

`["get_search_console_report", {dimension:"query", rowLimit:5}]`.

- [ ] **Step 2: Deploy + production doğrulama**

Run: `npx wrangler deploy` → `MCP_BASE=...studioplx.workers.dev/mcp MCP_API_KEY=... node scripts/mcp-smoke-test.mjs`
Expected: **11 araç** [OK]/anlamlı; Search Console gerçek sorgular.

- [ ] **Step 3: Geçici verify scriptlerini sil**

Run: `git rm scripts/verify-ig-posts.mjs` (gerekiyorsa).

- [ ] **Step 4: npm test (tüm birim testler)**

Run: `npm test`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit + push**

```bash
git add -A && git commit -m "test: smoke test'e Search Console; Faz 1 tamam, canlı doğrulandı"
git push origin main
```

- [ ] **Step 6: Hafıza güncelle**

`memory/kamutesisleri-poke-mcp-project.md`: Faz 1 araçları eklendi (11 araç), GSC scope+property, FB_PAGE_ID, Notion sosyal kolonları notu.

---

## Self-Review notları
- **Spec kapsamı:** 4 yeni araç (Task 4/5/6+9 sosyal, 13/14 Search Console) + Notion trend (Task 6/7/8) + cron (Task 8) — tümü karşılanıyor.
- **Tip tutarlılığı:** `computeEngagementRate`, `analyzePostingTimes`, `computeDelta`, `mapSearchConsole`, `getInstagramPosts`, `getFacebookPageInsights`, `getSearchConsoleReport`, `getSocialGrowth` adları plan boyunca tutarlı.
- **Önkoşullar:** Search Console scope/enable Task 11'de; FB_PAGE_ID/GSC_SITE_URL Task 5/14'te env'e eklenir.
