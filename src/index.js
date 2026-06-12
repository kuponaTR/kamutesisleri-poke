require('dotenv').config();
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { Client } = require('@notionhq/client');
const { google } = require('googleapis');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const notion = new Client({ auth: NOTION_API_KEY });

async function getInstagramMetrics() {
  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igId) return null;
  try {
    const fields = 'username,followers_count,media_count';
    const infoRes = await fetch(`https://graph.facebook.com/v17.0/${igId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
    const pageInfo = await infoRes.json();
    const insightsRes = await fetch(`https://graph.facebook.com/v17.0/${igId}/insights?metric=impressions,reach&period=day&access_token=${encodeURIComponent(token)}`);
    const insights = await insightsRes.json();
    return { pageInfo, insights };
  } catch (e) {
    console.error('Instagram error', e.message || e);
    return null;
  }
}
const notion = new Client({ auth: NOTION_API_KEY });

async function addNotionRow(title, body) {
  if (!NOTION_DATABASE_ID) throw new Error('NOTION_DATABASE_ID missing');
  const properties = {
    Name: {
      title: [{ text: { content: title } }]
    },
    Note: {
      rich_text: [{ text: { content: body } }]
    }
  };
  return notion.pages.create({ parent: { database_id: NOTION_DATABASE_ID }, properties });
}

async function fetchSite(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'poke-integration/0.1' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const text = $('body').text().slice(0, 5000).replace(/\s+/g, ' ').trim();
  return { title, snippet: text };
}

async function getGa4Metrics() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GA4_PROPERTY_ID) return null;
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  const accessToken = await oauth2Client.getAccessToken();
  const analytics = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
  try {
    const res = await analytics.properties.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      requestBody: {
        dimensions: [{ name: 'pageTitle' }],
        metrics: [{ name: 'activeUsers' }],
        limit: 5
      }
    });
    return res.data;
  const ig = await getInstagramMetrics();
  if (ig) {
    await addNotionRow('Instagram Snapshot', JSON.stringify(ig, null, 2).slice(0, 2000));
  }
  } catch (e) {
    console.error('GA4 error', e.message || e);
    return null;
  }
}

async function getInstagramMetrics() {
  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igId) return null;
  try {
    const url = `https://graph.facebook.com/v17.0/${igId}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error('Instagram API error', data.error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Instagram fetch error', e);
    return null;
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'notion-test') {
    const r = await addNotionRow('Test from Poke', 'Bu bir test notudur');
    console.log('Notion response', r.id);
    return;
  }

  // default: scan
  const site = await fetchSite('https://kamutesisleri.com');
  console.log('site', site.title);
  await addNotionRow(site.title, site.snippet.slice(0, 2000));

  const ga = await getGa4Metrics();
  if (ga) {
    await addNotionRow('GA4 Snapshot', JSON.stringify(ga.rows || ga, null, 2).slice(0, 2000));
  }
  const ig = await getInstagramMetrics();
  if (ig) {
    await addNotionRow('Instagram Snapshot', JSON.stringify(ig, null, 2).slice(0, 2000));
  }
  console.log('Done');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
