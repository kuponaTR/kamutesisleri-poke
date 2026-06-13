export interface Env {
  // wrangler.jsonc "vars"
  SITE_URL: string;
  GA4_PROPERTY_ID: string;
  NOTION_DATABASE_ID: string;
  ADMOB_PUBLISHER_ID: string;
  FB_PAGE_ID: string;
  GSC_SITE_URL: string;

  // wrangler secret put ile yüklenen gizli değerler
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  NOTION_API_KEY: string;
  /** Poke entegrasyonunun bu sunucuya bağlanırken kullanacağı API anahtarı */
  MCP_API_KEY: string;

  // Opsiyonel
  META_ACCESS_TOKEN?: string;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  /** Poke inbound API anahtarı — cron sonrası Poke'a özet mesaj göndermek için */
  POKE_API_KEY?: string;

  MCP_OBJECT: DurableObjectNamespace;
}

/** Araç sonuçlarının ortak zarfı: hata olsa bile akışı bozmadan raporlar */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function tryCall<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
