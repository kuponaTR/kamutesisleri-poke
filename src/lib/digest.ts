import type { Env } from "../types";
import { tryCall } from "../types";
import {
  getGa4DailyUsers,
  getAdsenseReport,
  getAdmobReport,
  getSearchConsoleReport,
} from "./google";
import { getInstagramInsights } from "./meta";
import { getSocialGrowth } from "./growth";

function dateNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function pct(cur: number, base: number): string {
  if (!base) return "";
  const p = Math.round(((cur - base) / base) * 100);
  return ` (7g ort. %${p >= 0 ? "+" : ""}${p})`;
}

export interface Digest {
  message: string;
  data: Record<string, unknown>;
}

/** Tüm kaynakları toplayıp trendli Türkçe günlük özet üretir. Her parça tryCall; başarısız satır atlanır. */
export async function buildDigest(env: Env): Promise<Digest> {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [`📊 kamutesisleri günlük özet (${date})`];
  const data: Record<string, unknown> = { date };

  const [series, adsense, admob, gscThis, gscPrev, ig, growth] = await Promise.all([
    tryCall(() => getGa4DailyUsers(env, 8)),
    tryCall(() => getAdsenseReport(env, "YESTERDAY")),
    tryCall(() => getAdmobReport(env)),
    tryCall(() => getSearchConsoleReport(env, dateNDaysAgo(7), dateNDaysAgo(1), "query", 3)),
    tryCall(() => getSearchConsoleReport(env, dateNDaysAgo(14), dateNDaysAgo(8), "query", 1)),
    tryCall(() => getInstagramInsights(env)),
    tryCall(() => getSocialGrowth(env, 7)),
  ]);

  if (series.ok && series.data.length >= 1) {
    const s = series.data;
    const yesterday = s[s.length - 1].activeUsers;
    const prior = s.slice(0, -1).slice(-7).map((x) => x.activeUsers);
    const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
    lines.push(`• GA4: ${yesterday} aktif kullanıcı${pct(yesterday, avg)}`);
    data.ga4 = { yesterday, prior7Avg: Math.round(avg) };
  }

  const adsenseT = adsense.ok ? adsense.data.estimatedEarnings : null;
  const admobT = admob.ok ? admob.data.estimatedEarnings : null;
  if (adsenseT != null || admobT != null) {
    const total = Math.round(((adsenseT ?? 0) + (admobT ?? 0)) * 100) / 100;
    lines.push(
      `• Kazanç: ${total} TRY (AdSense ${adsenseT?.toFixed(2) ?? "?"} + AdMob ${admobT?.toFixed(2) ?? "?"})`
    );
    data.kazanc = { total, adsense: adsenseT, admob: admobT };
  }

  if (gscThis.ok) {
    const tw = gscThis.data.totals.clicks;
    const pw = gscPrev.ok ? gscPrev.data.totals.clicks : 0;
    const top = gscThis.data.rows[0];
    const wow = pw ? ` (haftalık %${Math.round(((tw - pw) / pw) * 100)})` : "";
    const topStr = top ? `, top sorgu "${top.key}" poz ${top.position}` : "";
    lines.push(`• SEO: ${tw} tık${wow}${topStr}`);
    data.seo = { thisWeekClicks: tw, prevWeekClicks: pw, top: top ?? null };
  }

  if (ig.ok) {
    const g = growth.ok ? growth.data.igFollowers : null;
    const gStr = g && g.deltaPct != null ? ` (%${g.deltaPct >= 0 ? "+" : ""}${g.deltaPct})` : "";
    lines.push(
      `• IG: ${ig.data.followersCount} takipçi${gStr}, dünkü reach ${ig.data.reachLastDay ?? "?"}`
    );
    data.instagram = { followers: ig.data.followersCount, reach: ig.data.reachLastDay };
  }

  return { message: lines.join("\n"), data };
}
