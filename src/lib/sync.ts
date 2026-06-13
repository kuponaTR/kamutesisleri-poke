import type { Env, ToolResult } from "../types";
import { tryCall } from "../types";
import { getGa4Report, getAdsenseReport, getAdmobReport } from "./google";
import type { Ga4Summary, AdsenseSummary, AdmobSummary } from "./google";
import { scanWebsite } from "./scanner";
import type { ScanResult } from "./scanner";
import { getInstagramInsights } from "./meta";
import type { InstagramSummary } from "./meta";
import { createStatsRecord } from "./notion";

export interface FullSyncResult {
  date: string;
  scan: ToolResult<ScanResult>;
  ga4: ToolResult<Ga4Summary>;
  adsense: ToolResult<AdsenseSummary>;
  admob: ToolResult<AdmobSummary>;
  instagram: ToolResult<InstagramSummary>;
  notion: ToolResult<{ pageId: string; url: string }> | { ok: false; error: "dry-run" };
}

export async function runFullSync(env: Env, dryRun = false): Promise<FullSyncResult> {
  const [scan, ga4, adsense, admob, instagram] = await Promise.all([
    tryCall(() => scanWebsite(env.SITE_URL)),
    tryCall(() => getGa4Report(env)),
    tryCall(() => getAdsenseReport(env, "TODAY")),
    tryCall(() => getAdmobReport(env)),
    tryCall(() => getInstagramInsights(env)),
  ]);

  const date = new Date().toISOString().slice(0, 10);

  const noteParts: string[] = [];
  if (scan.ok) {
    noteParts.push(
      `Site: ${scan.data.status} / ${scan.data.responseTimeMs}ms, ` +
        `AdSense tag: ${scan.data.hasAdsense ? "var" : "YOK"}, GA4 tag: ${scan.data.hasGa4Tag ? "var" : "YOK"}, ` +
        `sitemap: ${scan.data.sitemapOk ? "ok" : "YOK"}`
    );
  } else noteParts.push(`Site taraması başarısız: ${scan.error}`);
  if (ga4.ok) noteParts.push(`GA4 top sayfalar: ${ga4.data.topPages.map((p) => `${p.path} (${p.views})`).join(", ")}`);
  else noteParts.push(`GA4 hatası: ${ga4.error}`);
  if (!adsense.ok) noteParts.push(`AdSense hatası: ${adsense.error}`);
  if (!admob.ok) noteParts.push(`AdMob hatası: ${admob.error}`);
  if (instagram.ok)
    noteParts.push(`Instagram @${instagram.data.username}: ${instagram.data.followersCount} takipçi`);

  const adsenseToday = adsense.ok ? adsense.data.estimatedEarnings : undefined;
  const admobToday = admob.ok ? admob.data.estimatedEarnings : undefined;
  const kazanc =
    adsenseToday != null || admobToday != null
      ? Math.round(((adsenseToday ?? 0) + (admobToday ?? 0)) * 100) / 100
      : undefined;

  const notion: FullSyncResult["notion"] = dryRun
    ? { ok: false, error: "dry-run" }
    : await tryCall(() =>
        createStatsRecord(env, {
          name: `Günlük Rapor ${date}`,
          metrikTipi: "Günlük Özet",
          ga4Active: ga4.ok ? ga4.data.activeUsers : undefined,
          ziyaretciSayfaGoruntuleme: ga4.ok ? ga4.data.pageViews : undefined,
          adsenseToday,
          admobToday,
          kazanc,
          note: noteParts.join("\n"),
        })
      );

  return { date, scan, ga4, adsense, admob, instagram, notion };
}

/** Cron sonrası Poke'a kısa özet mesajı gönderir (POKE_API_KEY tanımlıysa) */
export async function notifyPoke(env: Env, result: FullSyncResult): Promise<void> {
  if (!env.POKE_API_KEY) return;
  const lines = [
    `kamutesisleri.com günlük otomatik senkronizasyon tamamlandı (${result.date}).`,
    result.ga4.ok
      ? `GA4: ${result.ga4.data.activeUsers} aktif kullanıcı, ${result.ga4.data.pageViews} görüntüleme.`
      : `GA4 alınamadı: ${result.ga4.error}`,
    result.admob.ok ? `AdMob: ${result.admob.data.estimatedEarnings.toFixed(2)} TRY.` : null,
    result.adsense.ok ? `AdSense: ${result.adsense.data.estimatedEarnings.toFixed(2)} TRY.` : null,
    result.notion.ok ? `Notion kaydı oluşturuldu: ${result.notion.data.url}` : `Notion kaydı oluşturulamadı.`,
  ].filter(Boolean);

  await fetch("https://poke.com/api/v1/inbound/api-message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POKE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: lines.join(" ") }),
  });
}
