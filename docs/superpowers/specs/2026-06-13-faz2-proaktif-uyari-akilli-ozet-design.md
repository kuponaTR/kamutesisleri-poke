# Faz 2 — Proaktif Uyarı + Akıllı Özet

**Tarih:** 2026-06-13
**Durum:** Onaylandı (tasarım)
**Repo:** kuponaTR/kamutesisleri-poke

## Amaç

Mevcut veri kaynaklarının (GA4, AdSense, AdMob, Search Console, Instagram, Facebook) üstüne bir "zeka katmanı": Poke'a (a) her gün trendli **akıllı özet** gönderir, (b) bir şey ters gittiğinde **proaktif uyarı** atar. Yeni veri kaynağı gerektirmez; mevcut cron + Notion geçmişi + Poke inbound API üzerine kurulur.

## Kapsam

### Dahil
- **Günlük akıllı özet** — sabah cron'unda, trend/% değişimli tek Poke mesajı.
- **`get_digest` aracı** — Poke'un istediği an çağırabileceği on-demand özet.
- **Proaktif uyarılar:**
  - **Site sorunu** — ayrı ~15 dk cron; durum değişiminde uyarır (erişilemez/çok yavaş → "🔴", düzelince → "🟢").
  - **Trafik anormalliği** — günlük; dünkü GA4 aktif kullanıcı, son 7 günün ortalamasından ±`TRAFFIC_ANOMALY_PCT`% saparsa.
  - **SEO düşüşü** — günlük; son 7 gün Search Console tıklama, önceki 7 güne göre `SEO_DROP_PCT`%'den fazla düşerse.

### Kapsam dışı (bilinçli)
- **SSL bitiş kontrolü** — Cloudflare Worker `fetch`'i TLS sertifikasını görmez; güvenilir okumak harici servis gerektirir. "Site sorunu" = erişilemez (HTTP≠200) + çok yavaş (`SLOW_MS`).
- Gelir düşüşü uyarısı (kullanıcı seçmedi).
- Mobil (Faz 3 iptal).

## Tasarım kararları
- **Doğrudan dönem karşılaştırması:** Anomali baseline'ı her çalışmada doğrudan API'den hesaplanır (GA4 günlük seri, GSC iki pencere). Notion geçmişinin birikmesine bağımlı değil → ilk günden çalışır.
- **Uyarı tekrarını önleme:** Site durumu KV'de saklanır; yalnızca durum *değişiminde* mesaj gider. Trafik/SEO günlük olduğundan en fazla günde 1 mesaj (KV gerekmez).

## Mimari

### Cron tetikleyiciler (wrangler.jsonc)
- `30 5 * * *` (mevcut) — `runFullSync` (Notion snapshot) + `buildDigest` → Poke + `runDailyAlerts` (trafik+SEO) → Poke.
- `*/15 * * * *` (YENİ) — yalnızca `runUptimeCheck` (hafif site kontrolü + durum değişiminde Poke).

`scheduled()` handler `event.cron` değerine göre dallanır.

### Durum saklama
- Cloudflare **KV namespace** `STATE` (yeni binding). Anahtar `site:status` = `"up"|"down"`. Uptime cron bu değeri okur/yazar; geçiş anında uyarır. İlk çalışmada (null) sadece durumu yazar (down ise uyarır).

### Dosya yapısı
- `src/lib/poke.ts` (YENİ) — `sendPoke(env, message): Promise<boolean>` (mevcut `notifyPoke`'tan çıkarılır; POKE_API_KEY yoksa no-op).
- `src/lib/alerts.ts` (YENİ):
  - Saf: `detectTrafficAnomaly(yesterday, prior7Avg, pct)`, `detectSeoDrop(thisWeek, prevWeek, pct)`, `uptimeTransition(prev, currentOk)` → birim test.
  - `runUptimeCheck(env)`, `runDailyAlerts(env)` → API + KV + sendPoke.
- `src/lib/digest.ts` (YENİ) — `buildDigest(env)` → `{ message, data }`; günlük cron ve `get_digest` aracı kullanır.
- `src/lib/google.ts` — `getGa4DailyUsers(env, days)` eklenir (anomali için günlük seri).
- `src/lib/sync.ts` — `notifyPoke` kaldırılır; yerine cron akışı `sendPoke` + `buildDigest` kullanır.
- `src/index.ts` — `get_digest` aracı; `scheduled()` dallanması.
- `src/types.ts` — `STATE: KVNamespace`; `TRAFFIC_ANOMALY_PCT`, `SEO_DROP_PCT`, `SLOW_MS` vars.
- `wrangler.jsonc` — ikinci cron, KV binding, eşik vars.

### Veri akışı (günlük digest)
GA4 dünkü + 7 günlük seri (trend), AdSense/AdMob dünkü kazanç, Search Console son 7g vs önceki 7g, Instagram takipçi + `get_social_growth`. Hepsi `tryCall` ile sarılır; biri başarısız olursa o satır atlanır, mesaj yine gider.

## Eşikler (vars, varsayılan)
- `TRAFFIC_ANOMALY_PCT` = `40` (dünkü kullanıcı 7g ort.'dan ±%40 saparsa)
- `SEO_DROP_PCT` = `30` (haftalık tıklama önceki haftaya göre >%30 düşerse)
- `SLOW_MS` = `5000` (yanıt süresi bunu aşarsa "yavaş")

## Araç arayüzü
### `get_digest`
- Girdi: yok.
- Çıktı: `{ message: string, data: {...} }` — günlük özetle aynı içerik, on-demand.

## Mesaj formatları (örnek)
- Digest: `📊 kamutesisleri günlük özet (2026-06-13)\n• GA4: 6.373 kullanıcı (7g ort. %+12)\n• Kazanç: 1.447 TRY (AdSense 1.337 + AdMob 110)\n• SEO: 7.266 tık (haftalık %+8), top sorgu "kamu tesisleri" poz 1\n• IG: 278.815 takipçi (+0,2%), dünkü reach 22.189`
- Uyarı (site): `🔴 UYARI: kamutesisleri.com erişilemiyor (HTTP 503).` / `🟢 kamutesisleri.com tekrar erişilebilir.`
- Uyarı (trafik): `⚠️ Trafik anormalliği: dün 1.200 kullanıcı, 7g ort. 6.300 (%-81).`
- Uyarı (SEO): `⚠️ SEO düşüşü: bu hafta 5.000 tık, önceki hafta 7.200 (%-31).`

## Hata yönetimi
- Tüm araçlar/cron adımları mevcut `errorText`/`tryCall` deseniyle; biri patlasa diğerleri etkilenmez.
- `sendPoke` POKE_API_KEY yoksa sessizce no-op (false döner).
- Uptime cron'da fetch exception = "down" sayılır.

## Test stratejisi
1. Saf fonksiyonlar (anomali/transition) vitest ile.
2. `buildDigest` ve cron akışı: `wrangler dev` + `curl .../cdn-cgi/handler/scheduled?cron=...` ile her iki cron tetiklenip mesaj üretimi doğrulanır (Poke'a tek doğrulama gönderimi).
3. `get_digest` MCP smoke test'e eklenir; production doğrulanır.

## Başarı kriterleri
- `get_digest` production'da gerçek trendli özet döndürür.
- Günlük cron Poke'a özet + (varsa) uyarı gönderir.
- 15 dk cron site durumunu KV'de izler, yalnızca geçişte uyarır.
- Mevcut 11 araç kırılmaz.
