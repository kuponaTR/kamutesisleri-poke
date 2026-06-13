#!/usr/bin/env node
// Yerel worker'a (localhost:8787) MCP Streamable HTTP üzerinden bağlanıp tüm araçları çağırır.
const BASE = process.env.MCP_BASE ?? "http://localhost:8787/mcp";
const KEY = process.env.MCP_API_KEY;
if (!KEY) { console.error("MCP_API_KEY gerekli"); process.exit(1); }

let sessionId = null;
let idc = 1;

function parseBody(text, ct) {
  // SSE ise data: satırlarını ayıkla
  if (ct && ct.includes("text/event-stream")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines.at(-1);
    return last ? JSON.parse(last.slice(5).trim()) : null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function rpc(method, params, isNotification = false) {
  const body = { jsonrpc: "2.0", method, ...(params ? { params } : {}) };
  if (!isNotification) body.id = idc++;
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "Authorization": `Bearer ${KEY}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(BASE, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  if (isNotification) return null;
  return parseBody(text, res.headers.get("content-type"));
}

async function callTool(name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  const c = r?.result?.content?.[0]?.text;
  const isErr = r?.result?.isError;
  return { isErr: !!isErr, text: c ?? JSON.stringify(r?.error ?? r) };
}

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "1.0.0" },
});
console.log("initialize:", init?.result?.serverInfo ?? init?.error ?? "?");
await rpc("notifications/initialized", {}, true);

const tools = await rpc("tools/list", {});
console.log("Araç sayısı:", tools?.result?.tools?.length, "->", tools?.result?.tools?.map((t) => t.name).join(", "));

console.log("\n================ ARAÇ TESTLERİ ================");
const tests = [
  ["scan_website", {}],
  ["get_ga4_report", { startDate: "7daysAgo", endDate: "yesterday" }],
  ["get_adsense_report", { dateRange: "LAST_7_DAYS" }],
  ["get_admob_report", {}],
  ["get_search_console_report", { dimension: "query", rowLimit: 5 }],
  ["get_instagram_insights", {}],
  ["get_instagram_posts", { limit: 5 }],
  ["get_facebook_page_insights", {}],
  ["get_social_growth", { days: 7 }],
  ["get_digest", {}],
  ["get_recent_notion_records", { limit: 2 }],
  ["run_full_sync", { dryRun: true }],
];
for (const [name, args] of tests) {
  try {
    const { isErr, text } = await callTool(name, args);
    const short = String(text).replace(/\s+/g, " ").slice(0, 280);
    console.log(`\n[${isErr ? "HATA" : "OK  "}] ${name}\n   ${short}`);
  } catch (e) {
    console.log(`\n[EXC ] ${name}\n   ${e.message}`);
  }
}
