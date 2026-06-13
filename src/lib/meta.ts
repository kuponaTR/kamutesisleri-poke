import type { Env } from "../types";

const GRAPH = "https://graph.facebook.com/v21.0";

async function metaGet(env: Env, path: string, params: Record<string, string>): Promise<any> {
  if (!env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN tanımlı değil.");
  const qs = new URLSearchParams({ ...params, access_token: env.META_ACCESS_TOKEN });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const body = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Meta API hatası ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

/** Etkileşim oranı (%): (beğeni+yorum+kaydetme)/reach * 100, bir ondalık. */
export function computeEngagementRate(
  likes: number,
  comments: number,
  saved: number,
  reach: number
): number {
  if (!reach) return 0;
  return Math.round(((likes + comments + saved) / reach) * 1000) / 10;
}

const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** Gönderi timestamp'lerinden haftanın günü ve saat (UTC) dağılımı çıkarır. */
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

export interface InstagramSummary {
  username: string;
  followersCount: number;
  mediaCount: number;
  reachLastDay: number | null;
}

export async function getInstagramInsights(env: Env): Promise<InstagramSummary> {
  if (!env.META_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    throw new Error(
      "Instagram yapılandırılmamış: META_ACCESS_TOKEN ve INSTAGRAM_BUSINESS_ACCOUNT_ID " +
        "secret'larını ekleyin (wrangler secret put)."
    );
  }
  const base = "https://graph.facebook.com/v21.0";
  const igId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const token = env.META_ACCESS_TOKEN;

  const profileRes = await fetch(
    `${base}/${igId}?fields=username,followers_count,media_count&access_token=${token}`
  );
  const profile = (await profileRes.json()) as any;
  if (!profileRes.ok) {
    throw new Error(`Instagram API hatası: ${profile?.error?.message ?? profileRes.status}`);
  }

  let reach: number | null = null;
  const insightsRes = await fetch(
    `${base}/${igId}/insights?metric=reach&period=day&access_token=${token}`
  );
  if (insightsRes.ok) {
    const insights = (await insightsRes.json()) as any;
    reach = insights.data?.find((d: any) => d.name === "reach")?.values?.at(-1)?.value ?? null;
  }

  return {
    username: profile.username,
    followersCount: profile.followers_count ?? 0,
    mediaCount: profile.media_count ?? 0,
    reachLastDay: reach,
  };
}

export interface InstagramPost {
  permalink: string;
  type: string;
  timestamp: string;
  caption: string;
  likes: number;
  comments: number;
  saved: number;
  reach: number;
  engagementRate: number;
}

export interface InstagramPostsSummary {
  account: string;
  posts: InstagramPost[];
  bestPosts: InstagramPost[];
  postingTimes: ReturnType<typeof analyzePostingTimes>;
}

export async function getInstagramPosts(env: Env, limit = 12): Promise<InstagramPostsSummary> {
  const ig = env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!ig) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID tanımlı değil.");

  // Kullanıcı adı + medya listesi tek istekte
  const root = await metaGet(env, ig, {
    fields:
      `username,media.limit(${limit}){id,caption,media_type,permalink,timestamp,like_count,comments_count}`,
  });

  const posts: InstagramPost[] = [];
  for (const m of root.media?.data ?? []) {
    let reach = 0;
    let saved = 0;
    try {
      const ins = await metaGet(env, `${m.id}/insights`, { metric: "reach,saved" });
      for (const d of ins.data ?? []) {
        const v = d.values?.[0]?.value ?? 0;
        if (d.name === "reach") reach = v;
        else if (d.name === "saved") saved = v;
      }
    } catch {
      // Bazı medya tiplerinde insights bulunmaz; atla.
    }
    const likes = m.like_count ?? 0;
    const comments = m.comments_count ?? 0;
    posts.push({
      permalink: m.permalink,
      type: m.media_type,
      timestamp: m.timestamp,
      caption: (m.caption ?? "").slice(0, 120),
      likes,
      comments,
      saved,
      reach,
      engagementRate: computeEngagementRate(likes, comments, saved, reach),
    });
  }

  const bestPosts = [...posts]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 3);

  return {
    account: root.username ?? "",
    posts,
    bestPosts,
    postingTimes: analyzePostingTimes(posts),
  };
}

export interface FacebookPageSummary {
  page: string;
  followers: number;
  reach: number;
  engagements: number;
  period: string;
}

export async function getFacebookPageInsights(env: Env, period = "week"): Promise<FacebookPageSummary> {
  const pid = env.FB_PAGE_ID;
  if (!pid) throw new Error("FB_PAGE_ID tanımlı değil.");
  const prof = await metaGet(env, pid, { fields: "name,followers_count,fan_count" });
  let reach = 0;
  let engagements = 0;
  try {
    const ins = await metaGet(env, `${pid}/insights`, {
      metric: "page_impressions_unique,page_post_engagements",
      period,
    });
    for (const d of ins.data ?? []) {
      const v = d.values?.at(-1)?.value ?? 0;
      if (d.name === "page_impressions_unique") reach = v;
      else if (d.name === "page_post_engagements") engagements = v;
    }
  } catch {
    // Sayfa insights metrikleri sürüm/izin bağımlı; gracefully 0 bırak.
  }
  return {
    page: prof.name,
    followers: prof.followers_count ?? prof.fan_count ?? 0,
    reach,
    engagements,
    period,
  };
}
