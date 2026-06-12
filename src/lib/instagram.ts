import type { Env } from "../types";

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
