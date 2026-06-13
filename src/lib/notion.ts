import type { Env } from "../types";

const NOTION_VERSION = "2022-06-28";

async function notionFetch<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Notion API hatası ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  }
  return body as T;
}

/**
 * "Kamu Tesisleri İstatistikleri" veritabanının şemasıyla birebir eşleşen alanlar.
 * Şemadaki kolonlar: Name (title), Timestamp (date), Metrik Tipi (select),
 * GA4 Active, Ziyaretçi / Sayfa Görüntüleme, Kazanç, AdSense Today, AdMob Today (number),
 * Kitle / Segment (select), Şehir (multi_select), Cihaz (select)
 */
export interface StatsRecord {
  name: string;
  timestamp?: string;
  metrikTipi?: string;
  ga4Active?: number;
  ziyaretciSayfaGoruntuleme?: number;
  kazanc?: number;
  adsenseToday?: number;
  admobToday?: number;
  igFollowers?: number;
  igReach?: number;
  fbFollowers?: number;
  kitleSegment?: string;
  sehirler?: string[];
  cihaz?: string;
  /** Sayfa içeriğine eklenecek serbest not (ör. tarama özeti) */
  note?: string;
}

export async function createStatsRecord(
  env: Env,
  record: StatsRecord
): Promise<{ pageId: string; url: string }> {
  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: record.name } }] },
    Timestamp: { date: { start: record.timestamp ?? new Date().toISOString() } },
  };
  if (record.metrikTipi) properties["Metrik Tipi"] = { select: { name: record.metrikTipi } };
  if (record.ga4Active != null) properties["GA4 Active"] = { number: record.ga4Active };
  if (record.ziyaretciSayfaGoruntuleme != null)
    properties["Ziyaretçi / Sayfa Görüntüleme"] = { number: record.ziyaretciSayfaGoruntuleme };
  if (record.kazanc != null) properties["Kazanç"] = { number: record.kazanc };
  if (record.adsenseToday != null) properties["AdSense Today"] = { number: record.adsenseToday };
  if (record.admobToday != null) properties["AdMob Today"] = { number: record.admobToday };
  if (record.igFollowers != null) properties["IG Takipçi"] = { number: record.igFollowers };
  if (record.igReach != null) properties["IG Reach"] = { number: record.igReach };
  if (record.fbFollowers != null) properties["FB Takipçi"] = { number: record.fbFollowers };
  if (record.kitleSegment) properties["Kitle / Segment"] = { select: { name: record.kitleSegment } };
  if (record.sehirler?.length)
    properties["Şehir"] = { multi_select: record.sehirler.map((name) => ({ name })) };
  if (record.cihaz) properties["Cihaz"] = { select: { name: record.cihaz } };

  const children = record.note
    ? [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: record.note.slice(0, 1990) } }] },
        },
      ]
    : undefined;

  const page = await notionFetch<any>(env, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties,
      ...(children ? { children } : {}),
    }),
  });
  return { pageId: page.id, url: page.url };
}

export async function getRecentRecords(env: Env, limit = 10) {
  const result = await notionFetch<any>(env, `/databases/${env.NOTION_DATABASE_ID}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: limit,
      sorts: [{ property: "Timestamp", direction: "descending" }],
    }),
  });
  return (result.results ?? []).map((page: any) => {
    const p = page.properties;
    return {
      name: p.Name?.title?.[0]?.plain_text ?? "",
      timestamp: p.Timestamp?.date?.start ?? null,
      metrikTipi: p["Metrik Tipi"]?.select?.name ?? null,
      ga4Active: p["GA4 Active"]?.number ?? null,
      ziyaretciSayfaGoruntuleme: p["Ziyaretçi / Sayfa Görüntüleme"]?.number ?? null,
      kazanc: p["Kazanç"]?.number ?? null,
      adsenseToday: p["AdSense Today"]?.number ?? null,
      admobToday: p["AdMob Today"]?.number ?? null,
      igFollowers: p["IG Takipçi"]?.number ?? null,
      igReach: p["IG Reach"]?.number ?? null,
      fbFollowers: p["FB Takipçi"]?.number ?? null,
      url: page.url,
    };
  });
}
