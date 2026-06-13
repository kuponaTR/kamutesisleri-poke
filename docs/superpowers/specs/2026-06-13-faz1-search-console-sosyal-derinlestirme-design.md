# Faz 1 — Search Console + Sosyal Medya Derinleştirme

**Tarih:** 2026-06-13
**Durum:** Onaylandı (tasarım) — uygulama planı bekliyor
**Repo:** kuponaTR/kamutesisleri-poke (Cloudflare Workers MCP sunucusu, Poke entegrasyonu)

## Amaç

Mevcut MCP sunucusunun izleme kapsamını genişletmek: web tarafına **Google Search Console** (organik arama görünürlüğü) eklemek ve **sosyal medya** tarafını yüzeysel metriklerden (toplam takipçi + reach) gerçek yönetim verisine (post bazında performans, büyüme trendi, Facebook sayfa metrikleri) çıkarmak.

Bu, daha büyük bir vizyonun (web + mobil + sosyal + proaktif zeka katmanı) **1. fazıdır**. Faz 2 (proaktif uyarı/akıllı özet) ve Faz 3 (mobil: Play Console + App Store Connect) ayrı spec'lerde ele alınacaktır.

## Kapsam

### Dahil
- **Search Console raporu** — tarih aralığı + boyut bazında (sorgu/sayfa/ülke/cihaz) tıklama, gösterim, CTR, ortalama pozisyon.
- **Instagram post insights** (@kamutesisleri) — son N gönderinin beğeni/yorum/kaydetme/reach/engagement oranı + en iyi gönderiler + paylaşım saati analizi.
- **Instagram büyüme trendi** — günlük Notion snapshot'ından dönemsel takipçi/reach % değişimi.
- **Facebook Sayfa insights** ("Kamu Tesisleri") — sayfa erişimi, etkileşim, takipçi sayısı.

### Kapsam dışı (bilinçli, YAGNI)
- @fundaylaindirimler IG hesabı ve Fundaylaindirimler FB sayfası.
- GA4/AdSense/AdMob ek metrikleri.
- Mobil uygulama entegrasyonları (Faz 3).
- Proaktif uyarılar / anomali tespiti (Faz 2).

## Önkoşullar (uygulama öncesi)

| # | Önkoşul | Kim | Notlar |
|---|---------|-----|--------|
| 1 | Token'a `webmasters.readonly` scope'u eklemek | Claude script'i hazırlar, kullanıcı tarayıcıda onaylar | `scripts/get-refresh-token.mjs` SCOPES listesine eklenir; redirect URI (`localhost:8765/callback`) zaten kayıtlı |
| 2 | "Google Search Console API"yi etkinleştirmek | Claude (Console üzerinden) | GCP projesi `uyecekme` (354715463072); Analytics Data API'de yapıldığı gibi |
| 3 | GSC property tespiti | Claude | Scope geldikten sonra `sites.list` ile; beklenen `sc-domain:kamutesisleri.com` |
| 4 | Notion DB'ye yeni kolonlar | Claude (Notion API `PATCH`) | IG Takipçi, IG Reach, FB Reach (number); idempotent |

Sosyal taraf **yeni kimlik bilgisi gerektirmez**: canlıda yüklü Kamu Tesisleri Page token'ı (`META_ACCESS_TOKEN`, süresiz) hem @kamutesisleri IG hesabını hem Kamu Tesisleri FB sayfasını kapsar.

## Mimari

### Dosya yapısı
- `src/lib/google.ts` → `getSearchConsoleReport()` eklenir. Mevcut `getAccessToken` / `googleJson` altyapısı aynen kullanılır.
- `src/lib/instagram.ts` → **`src/lib/meta.ts`** olarak yeniden adlandırılır. İçerik:
  - `getInstagramInsights(env)` — mevcut, korunur.
  - `getInstagramPosts(env, limit)` — yeni.
  - `getFacebookPageInsights(env, period)` — yeni.
  - Ortak yardımcı: `metaGet(path, params)` (graph.facebook.com v21.0, `META_ACCESS_TOKEN`).
- `src/lib/sync.ts` → `runFullSync` IG/FB snapshot'ı toplar ve günlük kayda yazar; `getSocialGrowth(env, days)` eklenir (Notion son kayıtlarından hesaplar). İmport `./instagram` → `./meta` olarak güncellenir.
- `src/index.ts` → 4 yeni `server.tool(...)` kaydı; import güncellemeleri.
- `wrangler.jsonc` → `vars`'a `GSC_SITE_URL` ve `FB_PAGE_ID` (`1004566529413415`, Kamu Tesisleri sayfası) eklenir.
- `src/types.ts` → `Env`'e `GSC_SITE_URL: string` ve `FB_PAGE_ID: string` eklenir.

### Veri akışı
- **Search Console:** `get_search_console_report` → `POST searchconsole.googleapis.com/webmasters/v3/sites/{GSC_SITE_URL}/searchAnalytics/query` (Bearer = Google access token).
- **IG posts:** `get_instagram_posts` → `GET /{IG_ID}/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=N` ardından her medya için `GET /{media-id}/insights?metric=reach,saved` (Page token). Engagement oranı = (likes+comments+saved)/reach. Paylaşım saati analizi `timestamp`'lerden hesaplanır (ek API yok).
- **FB page:** `get_facebook_page_insights` → `GET /{FB_PAGE_ID}?fields=followers_count,fan_count` + `GET /{FB_PAGE_ID}/insights?metric=page_impressions_unique,page_post_engagements&period={period}` (Page token). `FB_PAGE_ID` = `1004566529413415` (wrangler.jsonc vars).
- **Büyüme trendi:** `get_social_growth` → Notion `databases/{id}/query` (Timestamp desc) → bugünkü vs `days` önceki kayıttan IG Takipçi / IG Reach / FB Reach farkları.
- **Cron:** `runFullSync` IG insights + FB page insights çağırır, günlük Notion kaydına IG Takipçi/IG Reach/FB Reach yazar; `notifyPoke` özetine sosyal satır ekler.

### Token modeli
Tek Meta kimlik bilgisi: `META_ACCESS_TOKEN` = Kamu Tesisleri **Page token** (süresiz). Tüm Faz 1 sosyal araçları bunu kullanır. (Çoklu hesap gerekirse Faz sonrası: süresiz USER token + `/me/accounts` ile çalışma zamanı page-token çözümü — bu fazda gerekmiyor.)

## Araç arayüzleri (MCP)

### `get_search_console_report`
- Girdi: `startDate?` (YYYY-MM-DD, vars. son 28 gün başlangıcı), `endDate?` (vars. dün), `dimension?` (`query`|`page`|`country`|`device`, vars. `query`), `rowLimit?` (1–25, vars. 10)
- Çıktı: `{ startDate, endDate, dimension, totals:{clicks,impressions,ctr,position}, rows:[{key,clicks,impressions,ctr,position}] }`

### `get_instagram_posts`
- Girdi: `limit?` (1–25, vars. 12)
- Çıktı: `{ account, posts:[{permalink,type,timestamp,caption,likes,comments,saved,reach,engagementRate}], bestPosts:[en iyi 3 engagement], postingTimes:{byWeekday:{...}, byHour:{...}} }`

### `get_facebook_page_insights`
- Girdi: `period?` (`day`|`week`|`days_28`, vars. `week`)
- Çıktı: `{ page, followers, reach, engagements, period }`

### `get_social_growth`
- Girdi: `days?` (geriye bakış, vars. 7)
- Çıktı: `{ igFollowers:{current,previous,deltaAbs,deltaPct}, igReach:{...}, fbReach:{...} }`

Mevcut 7 araç değişmeden korunur (geriye dönük kırılma yok).

## Hata yönetimi
- Her araç `index.ts`'teki mevcut `errorText` zarfıyla sarılır.
- Search Console scope/enable hataları (`403 SCOPE` / `SERVICE_DISABLED`) mevcut `SCOPE_HELP` desenine benzer açıklayıcı mesaj döner.
- Meta insights metrikleri sürüm bağımlı; deprecate olmuş metrik 400 dönerse araç o metriği atlayıp kalanları döndürür (graceful degradation), `tryCall` deseni korunur.
- `get_social_growth` yeterli geçmiş kayıt yoksa `previous: null` ve `deltaPct: null` döner (hata değil).

## Test stratejisi
1. Her yeni fonksiyon önce canlı API'ye karşı doğrulanır (curl/node), beklenen alanlar gelir.
2. `scripts/mcp-smoke-test.mjs` 4 yeni aracı kapsayacak şekilde genişletilir.
3. `wrangler dev` (yerel, `.dev.vars`) ile uçtan uca MCP testi.
4. Production deploy sonrası `MCP_BASE=...studioplx.workers.dev/mcp` ile smoke test.

## Devreye alma sırası
1. **Sosyal derinleştirme** (kimlik bilgisi gerektirmez): `meta.ts` refactor, `get_instagram_posts`, `get_facebook_page_insights`, Notion kolon migrasyonu, `get_social_growth`, `runFullSync` güncellemesi. Deploy + doğrula.
2. **Search Console** (scope + API enable gerektirir): script scope ekleme, OAuth yeniden çalıştırma, API enable, `GSC_SITE_URL`, `get_search_console_report`. Deploy + doğrula.

## Başarı kriterleri
- 4 yeni araç production `studioplx.workers.dev/mcp` üzerinde gerçek veriyle yanıt verir.
- `get_instagram_posts` son gönderiler için doğru engagement oranı ve paylaşım saati dağılımı üretir.
- `get_search_console_report` @kamutesisleri sitesinin gerçek arama sorgularını/pozisyonlarını döndürür.
- Günlük cron, IG/FB snapshot'ını Notion'a yazar; `get_social_growth` en az 2 kayıt biriktikten sonra anlamlı % değişim üretir.
- Mevcut 7 araç kırılmadan çalışmaya devam eder.
