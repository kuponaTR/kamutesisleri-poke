# kamutesisleri-poke-mcp

[Poke](https://poke.com) için **MCP sunucusu** — Cloudflare Workers üzerinde çalışır.
Poke bu sunucuya bağlanarak `kamutesisleri.com` ekosistemini manuel veya otonom inceleyebilir
ve sonuçları Notion'daki **Kamu Tesisleri İstatistikleri** veritabanına kaydedebilir.

## Araçlar (MCP tools)

| Araç | Açıklama |
|---|---|
| `scan_website` | Site sağlık taraması: durum kodu, yanıt süresi, title/meta, AdSense + GA4 tag, robots/sitemap |
| `get_ga4_report` | GA4: aktif kullanıcı, oturum, sayfa görüntüleme, top 5 sayfa |
| `get_adsense_report` | AdSense tahmini kazanç, gösterim, tıklama |
| `get_admob_report` | AdMob kazanç raporu (TRY) |
| `get_instagram_insights` | Instagram takipçi/erişim özeti (META_ACCESS_TOKEN gerekli) |
| `save_to_notion` | Notion veritabanına esnek kayıt ekler |
| `get_recent_notion_records` | Son Notion kayıtlarını listeler |
| `run_full_sync` | Hepsini toplar + Notion'a günlük özet yazar (`dryRun` destekler) |

Ayrıca her gün 05:30 UTC'de (08:30 İstanbul) **cron tetikleyicisi** `run_full_sync` çalıştırır ve
`POKE_API_KEY` tanımlıysa Poke'a özet mesaj gönderir.

## Kurulum

```bash
npm install
npx wrangler login            # gerekiyorsa
npx wrangler deploy
```

Secret'ları yükleyin (değerler asla koda/git'e girmez):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
npx wrangler secret put NOTION_API_KEY
npx wrangler secret put MCP_API_KEY        # kendiniz üretin: openssl rand -hex 24
# opsiyonel:
npx wrangler secret put META_ACCESS_TOKEN
npx wrangler secret put INSTAGRAM_BUSINESS_ACCOUNT_ID
npx wrangler secret put POKE_API_KEY       # poke.com > Settings > Advanced > API Keys
```

Yerel geliştirme: `.dev.vars.example` → `.dev.vars` kopyalayıp doldurun, `npm run dev`.

## Google kapsamları (önemli)

GA4 ve AdSense araçları için refresh token'ın şu kapsamları içermesi gerekir:
`analytics.readonly`, `adsense.readonly`, `admob.readonly`. Yeni token üretmek için:

1. Google Cloud Console'da OAuth client'a `http://localhost:8765/callback` redirect URI'sini ekleyin.
2. `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run get-refresh-token`
3. Çıkan token'ı `npx wrangler secret put GOOGLE_REFRESH_TOKEN` ile yükleyin.

## Poke'a bağlama

1. Poke → **Settings → Integrations → Add Custom MCP Server**
2. **Name:** `KamuTesisleri İstihbarat`
3. **URL:** `https://kamutesisleri-poke-mcp.<subdomain>.workers.dev/mcp` (SSE isterseniz `/sse`)
4. **API Key:** `MCP_API_KEY` olarak belirlediğiniz değer
5. Kaydedin — Poke araçları otomatik keşfeder. Örnek komut:
   *"kamutesisleri için run_full_sync çalıştır ve sonucu özetle"*

Otonom kullanım için Poke'ta bir otomasyon tarif edin, ör:
*"Her akşam 21:00'de get_ga4_report ve get_admob_report araçlarını çağır, sonuçları save_to_notion ile kaydet ve bana özet gönder."*

## Mimari

```
Poke (iMessage/WhatsApp) ──MCP──▶ Cloudflare Worker (bu repo)
                                   ├─ kamutesisleri.com (tarama)
                                   ├─ Google Analytics Data API (GA4)
                                   ├─ AdSense Management API
                                   ├─ AdMob API
                                   ├─ Instagram Graph API
                                   └─ Notion API ──▶ "Kamu Tesisleri İstatistikleri" DB
Cron (her gün 05:30 UTC) ──▶ run_full_sync ──▶ Notion + Poke bildirim
```
