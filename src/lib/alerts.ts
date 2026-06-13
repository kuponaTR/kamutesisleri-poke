// Proaktif uyarı mantığı. Saf tespit fonksiyonları (birim test edilir) + çalışma
// zamanı kontrolleri (runUptimeCheck, runDailyAlerts).
import type { Env } from "../types";
import { scanWebsite } from "./scanner";
import { sendPoke } from "./poke";
import { getGa4DailyUsers, getSearchConsoleReport } from "./google";

/** Dünkü değer 7 günlük ortalamadan ±pct% saparsa anomali döndürür. */
export function detectTrafficAnomaly(yesterday: number, prior7Avg: number, pct: number) {
  if (!prior7Avg) return null;
  const changePct = Math.round(((yesterday - prior7Avg) / prior7Avg) * 100);
  if (Math.abs(changePct) < pct) return null;
  return {
    changePct,
    direction: changePct < 0 ? ("down" as const) : ("up" as const),
    yesterday,
    prior7Avg,
  };
}

/** Bu haftaki tıklama önceki haftaya göre pct%'den fazla düşerse drop döndürür. */
export function detectSeoDrop(thisWeek: number, prevWeek: number, pct: number) {
  if (!prevWeek) return null;
  const changePct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
  if (changePct > -pct) return null;
  return { changePct, thisWeek, prevWeek };
}

/** Önceki duruma göre uptime geçişini belirler. null->up sessiz, ilk down uyarır. */
export function uptimeTransition(
  prev: "up" | "down" | null,
  currentOk: boolean
): "down" | "recovered" | null {
  const cur = currentOk ? "up" : "down";
  if (prev === cur) return null;
  if (cur === "down") return "down";
  if (prev === "down") return "recovered";
  return null; // null -> up: sessiz
}

function dateNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** ~15 dk cron: siteyi kontrol eder, KV'deki durumla karşılaştırır, yalnızca geçişte uyarır. */
export async function runUptimeCheck(env: Env): Promise<void> {
  let ok = false;
  let detail = "";
  try {
    const r = await scanWebsite(env.SITE_URL);
    ok = r.status === 200 && r.responseTimeMs < Number(env.SLOW_MS ?? 5000);
    detail = `HTTP ${r.status}, ${r.responseTimeMs}ms`;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  const prev = (await env.STATE.get("site:status")) as "up" | "down" | null;
  const t = uptimeTransition(prev, ok);
  await env.STATE.put("site:status", ok ? "up" : "down");
  if (t === "down") await sendPoke(env, `🔴 UYARI: kamutesisleri.com erişilemiyor/yavaş (${detail}).`);
  else if (t === "recovered") await sendPoke(env, `🟢 kamutesisleri.com tekrar normal (${detail}).`);
}

/** Günlük cron: trafik anormalliği + SEO düşüşü kontrolü. Uyarı satırlarını döndürür ve Poke'a gönderir. */
export async function runDailyAlerts(env: Env): Promise<string[]> {
  const lines: string[] = [];

  // Trafik: dün vs son 7 günün ortalaması
  try {
    const series = await getGa4DailyUsers(env, 8);
    if (series.length >= 2) {
      const yesterday = series[series.length - 1].activeUsers;
      const prior = series.slice(0, -1).slice(-7).map((s) => s.activeUsers);
      const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
      const a = detectTrafficAnomaly(yesterday, avg, Number(env.TRAFFIC_ANOMALY_PCT ?? 40));
      if (a) {
        lines.push(
          `⚠️ Trafik anormalliği: dün ${a.yesterday} kullanıcı, 7g ort. ${Math.round(a.prior7Avg)} (%${a.changePct}).`
        );
      }
    }
  } catch (e) {
    // sessizce atla
  }

  // SEO: son 7 gün vs önceki 7 gün tıklama
  try {
    const thisWeek = await getSearchConsoleReport(env, dateNDaysAgo(7), dateNDaysAgo(1), "query", 1);
    const prevWeek = await getSearchConsoleReport(env, dateNDaysAgo(14), dateNDaysAgo(8), "query", 1);
    const d = detectSeoDrop(
      thisWeek.totals.clicks,
      prevWeek.totals.clicks,
      Number(env.SEO_DROP_PCT ?? 30)
    );
    if (d) {
      lines.push(
        `⚠️ SEO düşüşü: bu hafta ${d.thisWeek} tık, önceki hafta ${d.prevWeek} (%${d.changePct}).`
      );
    }
  } catch (e) {
    // sessizce atla
  }

  if (lines.length) await sendPoke(env, lines.join("\n"));
  return lines;
}
