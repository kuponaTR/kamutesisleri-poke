export interface ScanResult {
  url: string;
  status: number;
  responseTimeMs: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  linkCount: number;
  hasAdsense: boolean;
  adsensePublisherId: string | null;
  hasGa4Tag: boolean;
  robotsTxtOk: boolean;
  sitemapOk: boolean;
  contentLengthKb: number;
}

function extract(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

export async function scanWebsite(siteUrl: string): Promise<ScanResult> {
  const started = Date.now();
  const res = await fetch(siteUrl, {
    headers: { "User-Agent": "KamuTesisleriBot/1.0 (+poke-mcp)" },
    redirect: "follow",
  });
  const html = await res.text();
  const responseTimeMs = Date.now() - started;

  const origin = new URL(res.url || siteUrl).origin;
  const [robotsRes, sitemapRes] = await Promise.all([
    fetch(`${origin}/robots.txt`, { method: "GET" }).catch(() => null),
    fetch(`${origin}/sitemap.xml`, { method: "GET" }).catch(() => null),
  ]);

  return {
    url: res.url || siteUrl,
    status: res.status,
    responseTimeMs,
    title: extract(html, /<title[^>]*>([^<]*)<\/title>/i),
    metaDescription: extract(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    ),
    h1: extract(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, "") ?? null,
    linkCount: (html.match(/<a\s/gi) ?? []).length,
    hasAdsense: /adsbygoogle|pagead2\.googlesyndication/.test(html),
    adsensePublisherId: extract(html, /(ca-pub-\d+)/) ,
    hasGa4Tag: /gtag\(|googletagmanager\.com/.test(html),
    robotsTxtOk: robotsRes?.ok ?? false,
    sitemapOk: sitemapRes?.ok ?? false,
    contentLengthKb: Math.round(html.length / 1024),
  };
}
