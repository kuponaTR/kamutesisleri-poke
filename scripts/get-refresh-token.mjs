#!/usr/bin/env node
/**
 * GA4 + AdSense + AdMob kapsamlarını içeren yeni bir Google refresh token üretir.
 *
 * Ön koşul: Google Cloud Console'da OAuth client'ın "Authorized redirect URIs"
 * listesine http://localhost:8765/callback ekli olmalı.
 *
 * Kullanım:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.mjs
 *   (veya değerleri .env / .dev.vars dosyasından kendiniz export edin)
 */
import http from "node:http";
import { execSync } from "node:child_process";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET ortam değişkenlerini ayarlayın.");
  process.exit(1);
}

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/adsense.readonly",
  "https://www.googleapis.com/auth/admob.readonly",
].join(" ");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("code parametresi yok");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await tokenRes.json();
  if (data.refresh_token) {
    res.end("Tamam! Refresh token terminale yazildi, bu pencereyi kapatabilirsiniz.");
    console.log("\n=== YENİ REFRESH TOKEN ===\n");
    console.log(data.refresh_token);
    console.log("\nKapsamlar:", data.scope);
    console.log("\nWorker'a yüklemek için:");
    console.log("  npx wrangler secret put GOOGLE_REFRESH_TOKEN");
  } else {
    res.end("Hata: " + JSON.stringify(data));
    console.error("Token alınamadı:", data);
  }
  server.close();
});

server.listen(PORT, () => {
  console.log("Tarayıcıda açın:\n\n" + authUrl + "\n");
  try {
    execSync(`open "${authUrl}"`);
  } catch {
    // open komutu yoksa kullanıcı linki elle açar
  }
});
