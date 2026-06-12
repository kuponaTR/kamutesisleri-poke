import type { Env } from "../types";

const SCOPE_HELP =
  "Mevcut refresh token bu API'nin kapsamını (scope) içermiyor. " +
  "`npm run get-refresh-token` ile analytics.readonly + adsense.readonly + admob.readonly " +
  "kapsamlarını içeren yeni bir token üretip GOOGLE_REFRESH_TOKEN secret'ını güncelleyin.";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Google access token alınamadı: ${data.error ?? res.status} ${data.error_description ?? ""}`
    );
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function googleJson<T>(env: Env, url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(env);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as any;
  if (!res.ok) {
    const reason = body?.error?.details?.[0]?.reason ?? body?.error?.status ?? "";
    if (res.status === 403 && String(reason).includes("SCOPE")) {
      throw new Error(`Yetki kapsamı yetersiz (403). ${SCOPE_HELP}`);
    }
    throw new Error(`Google API hatası ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  return body as T;
}

// ---------------------------------------------------------------- GA4

export interface Ga4Summary {
  startDate: string;
  endDate: string;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  topPages: { path: string; views: number }[];
}

export async function getGa4Report(
  env: Env,
  startDate = "yesterday",
  endDate = "yesterday"
): Promise<Ga4Summary> {
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`;

  const totals = await googleJson<any>(env, base, {
    method: "POST",
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
    }),
  });
  const row = totals.rows?.[0]?.metricValues ?? [];

  const pages = await googleJson<any>(env, base, {
    method: "POST",
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 5,
    }),
  });

  return {
    startDate,
    endDate,
    activeUsers: Number(row[0]?.value ?? 0),
    sessions: Number(row[1]?.value ?? 0),
    pageViews: Number(row[2]?.value ?? 0),
    topPages: (pages.rows ?? []).map((r: any) => ({
      path: r.dimensionValues[0].value,
      views: Number(r.metricValues[0].value),
    })),
  };
}

// ---------------------------------------------------------------- AdSense

export type AdsenseDateRange =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "MONTH_TO_DATE";

export interface AdsenseSummary {
  dateRange: string;
  currency: string;
  estimatedEarnings: number;
  pageViews: number;
  impressions: number;
  clicks: number;
}

export async function getAdsenseReport(
  env: Env,
  dateRange: AdsenseDateRange = "YESTERDAY"
): Promise<AdsenseSummary> {
  const accounts = await googleJson<any>(env, "https://adsense.googleapis.com/v2/accounts");
  const account = accounts.accounts?.[0]?.name;
  if (!account) throw new Error("AdSense hesabı bulunamadı.");

  const params = new URLSearchParams({ dateRange });
  for (const m of ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "IMPRESSIONS", "CLICKS"]) {
    params.append("metrics", m);
  }
  const report = await googleJson<any>(
    env,
    `https://adsense.googleapis.com/v2/${account}/reports:generate?${params}`
  );
  const cells = report.totals?.cells ?? [];
  return {
    dateRange,
    currency: report.headers?.[0]?.currencyCode ?? "TRY",
    estimatedEarnings: Number(cells[0]?.value ?? 0),
    pageViews: Number(cells[1]?.value ?? 0),
    impressions: Number(cells[2]?.value ?? 0),
    clicks: Number(cells[3]?.value ?? 0),
  };
}

// ---------------------------------------------------------------- AdMob

export interface AdmobSummary {
  startDate: string;
  endDate: string;
  currency: string;
  estimatedEarnings: number;
  impressions: number;
  clicks: number;
  adRequests: number;
}

function toGoogleDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export async function getAdmobReport(
  env: Env,
  startDate?: string,
  endDate?: string
): Promise<AdmobSummary> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const start = startDate ?? yesterday;
  const end = endDate ?? yesterday;

  const body = {
    reportSpec: {
      dateRange: { startDate: toGoogleDate(start), endDate: toGoogleDate(end) },
      metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS", "AD_REQUESTS"],
      localizationSettings: { currencyCode: "TRY" },
    },
  };
  const rows = await googleJson<any[]>(
    env,
    `https://admob.googleapis.com/v1/accounts/${env.ADMOB_PUBLISHER_ID}/networkReport:generate`,
    { method: "POST", body: JSON.stringify(body) }
  );

  const summary: AdmobSummary = {
    startDate: start,
    endDate: end,
    currency: "TRY",
    estimatedEarnings: 0,
    impressions: 0,
    clicks: 0,
    adRequests: 0,
  };
  for (const chunk of rows) {
    const values = chunk.row?.metricValues;
    if (!values) continue;
    summary.estimatedEarnings += Number(values.ESTIMATED_EARNINGS?.microsValue ?? 0) / 1_000_000;
    summary.impressions += Number(values.IMPRESSIONS?.integerValue ?? 0);
    summary.clicks += Number(values.CLICKS?.integerValue ?? 0);
    summary.adRequests += Number(values.AD_REQUESTS?.integerValue ?? 0);
  }
  return summary;
}
