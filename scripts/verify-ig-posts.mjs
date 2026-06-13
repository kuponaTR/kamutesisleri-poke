#!/usr/bin/env node
// getInstagramPosts mantığını canlı Graph API'ye karşı doğrular (token yazdırılmaz).
const TOKEN = process.env.META_ACCESS_TOKEN;
const IG = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
if (!TOKEN || !IG) { console.error("META_ACCESS_TOKEN ve INSTAGRAM_BUSINESS_ACCOUNT_ID gerekli"); process.exit(1); }
const G = "https://graph.facebook.com/v21.0";
const limit = 5;

const root = await fetch(
  `${G}/${IG}?fields=username,media.limit(${limit}){id,caption,media_type,permalink,timestamp,like_count,comments_count}&access_token=${TOKEN}`
).then((r) => r.json());
if (root.error) { console.error("HATA:", root.error.message); process.exit(1); }
console.log("account:", root.username, "| medya sayısı:", root.media?.data?.length);

for (const m of root.media?.data ?? []) {
  let reach = 0, saved = 0;
  const ins = await fetch(`${G}/${m.id}/insights?metric=reach,saved&access_token=${TOKEN}`).then((r) => r.json());
  if (!ins.error) for (const d of ins.data ?? []) {
    const v = d.values?.[0]?.value ?? 0;
    if (d.name === "reach") reach = v; else if (d.name === "saved") saved = v;
  }
  const likes = m.like_count ?? 0, comments = m.comments_count ?? 0;
  const er = reach ? Math.round(((likes + comments + saved) / reach) * 1000) / 10 : 0;
  console.log(`- ${m.media_type} ${m.timestamp} | beğeni ${likes} yorum ${comments} kaydet ${saved} reach ${reach} -> ER ${er}%`);
}
