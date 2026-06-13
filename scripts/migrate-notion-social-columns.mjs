#!/usr/bin/env node
// "Kamu Tesisleri İstatistikleri" DB'sine sosyal medya kolonlarını ekler (idempotent).
// Gerekli: NOTION_API_KEY, NOTION_DATABASE_ID
const KEY = process.env.NOTION_API_KEY;
const DB = process.env.NOTION_DATABASE_ID;
if (!KEY || !DB) { console.error("NOTION_API_KEY ve NOTION_DATABASE_ID gerekli"); process.exit(1); }

const H = { Authorization: `Bearer ${KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
const WANT = ["IG Takipçi", "IG Reach", "FB Takipçi"];

const db = await fetch(`https://api.notion.com/v1/databases/${DB}`, { headers: H }).then((r) => r.json());
if (db.object === "error") { console.error("DB okunamadı:", db.message); process.exit(1); }

const existing = new Set(Object.keys(db.properties ?? {}));
const toAdd = WANT.filter((n) => !existing.has(n));
if (toAdd.length === 0) { console.log("Tüm kolonlar zaten var:", WANT.join(", ")); process.exit(0); }

const properties = {};
for (const n of toAdd) properties[n] = { number: {} };

const res = await fetch(`https://api.notion.com/v1/databases/${DB}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ properties }),
});
const body = await res.json();
if (!res.ok) { console.error("PATCH hatası:", body.message ?? JSON.stringify(body)); process.exit(1); }
console.log("Eklendi:", toAdd.join(", "));
