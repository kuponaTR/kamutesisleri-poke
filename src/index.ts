import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./types";
import { getGa4Report, getAdsenseReport, getAdmobReport } from "./lib/google";
import { scanWebsite } from "./lib/scanner";
import { getInstagramInsights, getInstagramPosts, getFacebookPageInsights } from "./lib/meta";
import { getSocialGrowth } from "./lib/growth";
import { createStatsRecord, getRecentRecords } from "./lib/notion";
import { runFullSync, notifyPoke } from "./lib/sync";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorText(err: unknown) {
  return {
    content: [{ type: "text" as const, text: `HATA: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

export class KamuTesisleriMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "kamutesisleri-istihbarat",
    version: "1.0.0",
  });

  async init() {
    this.server.tool(
      "scan_website",
      "kamutesisleri.com sitesini tarar: erişilebilirlik, yanıt süresi, başlık/meta, AdSense ve GA4 tag kontrolü, robots.txt ve sitemap durumu.",
      { url: z.string().url().optional().describe("Varsayılan: kamutesisleri.com") },
      async ({ url }) => {
        try {
          return text(await scanWebsite(url ?? this.env.SITE_URL));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_ga4_report",
      "Google Analytics 4 raporu: aktif kullanıcı, oturum, sayfa görüntüleme ve en çok görüntülenen 5 sayfa. Tarihler 'yesterday', 'today', '7daysAgo' veya YYYY-MM-DD olabilir.",
      {
        startDate: z.string().optional().describe("Varsayılan: yesterday"),
        endDate: z.string().optional().describe("Varsayılan: yesterday"),
      },
      async ({ startDate, endDate }) => {
        try {
          return text(await getGa4Report(this.env, startDate, endDate));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_adsense_report",
      "AdSense kazanç raporu: tahmini kazanç, sayfa görüntüleme, gösterim ve tıklama.",
      {
        dateRange: z
          .enum(["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "MONTH_TO_DATE"])
          .optional()
          .describe("Varsayılan: YESTERDAY"),
      },
      async ({ dateRange }) => {
        try {
          return text(await getAdsenseReport(this.env, dateRange ?? "YESTERDAY"));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_admob_report",
      "AdMob kazanç raporu (TRY): tahmini kazanç, gösterim, tıklama ve reklam isteği sayısı.",
      {
        startDate: z.string().optional().describe("YYYY-MM-DD, varsayılan: dün"),
        endDate: z.string().optional().describe("YYYY-MM-DD, varsayılan: dün"),
      },
      async ({ startDate, endDate }) => {
        try {
          return text(await getAdmobReport(this.env, startDate, endDate));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_instagram_insights",
      "Instagram işletme hesabı özeti: takipçi sayısı, gönderi sayısı ve son günün erişimi (reach).",
      {},
      async () => {
        try {
          return text(await getInstagramInsights(this.env));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_instagram_posts",
      "Instagram son gönderilerinin performansı: beğeni, yorum, kaydetme, reach ve engagement oranı; en iyi 3 gönderi ve paylaşım saati/günü dağılımı.",
      { limit: z.number().int().min(1).max(25).optional().describe("Kaç gönderi, varsayılan 12") },
      async ({ limit }) => {
        try {
          return text(await getInstagramPosts(this.env, limit ?? 12));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_facebook_page_insights",
      "Facebook sayfası özeti: takipçi sayısı, sayfa erişimi (impressions) ve etkileşim. Dönem: day, week veya days_28.",
      { period: z.enum(["day", "week", "days_28"]).optional().describe("Varsayılan: week") },
      async ({ period }) => {
        try {
          return text(await getFacebookPageInsights(this.env, period ?? "week"));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_social_growth",
      "Sosyal medya büyüme trendi: Notion'daki günlük kayıtlardan IG takipçi, IG reach ve FB takipçi sayısının dönemsel mutlak ve yüzde değişimi.",
      { days: z.number().int().min(1).max(90).optional().describe("Geriye bakış (gün), varsayılan 7") },
      async ({ days }) => {
        try {
          return text(await getSocialGrowth(this.env, days ?? 7));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "save_to_notion",
      "Notion 'Kamu Tesisleri İstatistikleri' veritabanına kayıt ekler. Sadece verilen alanlar yazılır.",
      {
        name: z.string().describe("Kayıt başlığı (Name kolonu)"),
        metrikTipi: z.string().optional().describe("Metrik Tipi select değeri, ör. 'Günlük Özet'"),
        ga4Active: z.number().optional(),
        ziyaretciSayfaGoruntuleme: z.number().optional(),
        kazanc: z.number().optional(),
        adsenseToday: z.number().optional(),
        admobToday: z.number().optional(),
        kitleSegment: z.string().optional(),
        sehirler: z.array(z.string()).optional(),
        cihaz: z.string().optional(),
        note: z.string().optional().describe("Sayfa içeriğine eklenecek serbest not"),
      },
      async (record) => {
        try {
          return text(await createStatsRecord(this.env, record));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "get_recent_notion_records",
      "Notion veritabanındaki son kayıtları listeler (Timestamp'e göre azalan).",
      { limit: z.number().int().min(1).max(50).optional().describe("Varsayılan: 10") },
      async ({ limit }) => {
        try {
          return text(await getRecentRecords(this.env, limit ?? 10));
        } catch (err) {
          return errorText(err);
        }
      }
    );

    this.server.tool(
      "run_full_sync",
      "Tam senkronizasyon: site taraması + GA4 + AdSense + AdMob + Instagram verilerini toplar ve Notion'a günlük özet kaydı ekler. dryRun=true ise Notion'a yazmaz, sadece raporlar.",
      { dryRun: z.boolean().optional().describe("true ise Notion'a yazılmaz") },
      async ({ dryRun }) => {
        try {
          return text(await runFullSync(this.env, dryRun ?? false));
        } catch (err) {
          return errorText(err);
        }
      }
    );
  }
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.MCP_API_KEY) return false;
  const header = request.headers.get("Authorization") ?? "";
  return header === `Bearer ${env.MCP_API_KEY}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        service: "kamutesisleri-poke-mcp",
        status: "ok",
        endpoints: { mcp: "/mcp", sse: "/sse" },
        auth: "Authorization: Bearer <MCP_API_KEY>",
      });
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/sse")) {
      if (!isAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (url.pathname === "/mcp") {
        return KamuTesisleriMCP.serve("/mcp").fetch(request, env, ctx);
      }
      return KamuTesisleriMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runFullSync(env).then((result) => notifyPoke(env, result))
    );
  },
};
