import type { Env } from "../types";
import { getRecentRecords } from "./notion";

export interface Delta {
  current: number;
  previous: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
}

/** İki snapshot arasındaki mutlak ve yüzde farkını hesaplar. */
export function computeDelta(current: number, previous: number | null): Delta {
  if (previous == null) return { current, previous: null, deltaAbs: null, deltaPct: null };
  const deltaAbs = current - previous;
  const deltaPct = previous === 0 ? null : Math.round((deltaAbs / previous) * 1000) / 10;
  return { current, previous, deltaAbs, deltaPct };
}

export interface SocialGrowth {
  days: number;
  igFollowers: Delta;
  igReach: Delta;
  fbFollowers: Delta;
}

/**
 * Notion'daki günlük snapshot'lardan dönemsel büyümeyi hesaplar.
 * En güncel kayıt ile `days` önceki kaydı karşılaştırır; yeterli geçmiş yoksa previous null kalır.
 */
export async function getSocialGrowth(env: Env, days = 7): Promise<SocialGrowth> {
  const recs = await getRecentRecords(env, days + 1);
  const cur: any = recs[0] ?? {};
  const prev: any = recs[Math.min(days, recs.length - 1)] ?? {};
  // En güncel kayıt aynı zamanda tek kayıtsa previous yoktur.
  const prevOrNull = (field: string) => (recs.length > 1 ? prev[field] ?? null : null);
  return {
    days,
    igFollowers: computeDelta(cur.igFollowers ?? 0, prevOrNull("igFollowers")),
    igReach: computeDelta(cur.igReach ?? 0, prevOrNull("igReach")),
    fbFollowers: computeDelta(cur.fbFollowers ?? 0, prevOrNull("fbFollowers")),
  };
}
