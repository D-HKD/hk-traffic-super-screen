/**
 * 香港交通警報中心 v2 — CORS proxy / 聚合層（Cloudflare Worker）
 *
 * 與 v1 的分別：
 *   1. 新增 /api/rail：瀏覽器只發一個請求，Worker 內部並行打三個站 → 前端請求數 6 → 1。
 *   2. 邊緣快取（caches.default）：全港用戶共用同一份上游結果，上游負載與用戶數脫鈎。
 *   3. /mtr 的 URL 白名單由「字串前綴」改為「解析後主機 + 路徑」，更難被繞過。
 *   4. 上游請求有 8 秒逾時，失敗回 502 而不是無限等待。
 *   5. CORS 可以用 ALLOWED_ORIGINS 收窄（預設 *，因為全部是公開唯讀資料）。
 *
 * 部署：npx wrangler deploy
 */

import { sendPush } from './push.js';
import { ROAD_DEFS, aggregateSpeeds, parseDetectorInfoCsv, parseRawSpeedXml } from './roads.js';
import { BUS_STOPS } from './busstops.js';

const UPSTREAM = {
  weather: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc',
  traffic: 'https://www.td.gov.hk/tc/special_news/trafficnews.xml',
  schedule: 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php',
  lrt: 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule',
  kmbStopEta: 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta',
  tdRawSpeed: 'https://resource.data.one.gov.hk/td/traffic-detectors/rawSpeedVol-all.xml',
  tdDetectorInfo: 'https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/traffic_speed_volume_occ_info.csv',
};

const TML_STATIONS = new Set(['TIS', 'LOP', 'YUL', 'SIH', 'TUM']);

/** 九巴站 ID 係 16 位十六進制；用 regex 白名單，避免被當成任意 URL 代理。 */
const KMB_STOP_ID = /^[0-9A-F]{16}$/;

/** 邊緣快取秒數：到站資料變化最快，所以最短。 */
const TTL = { rail: 10, bus: 20, roads: 60, info: 21600, weather: 60, traffic: 45 };

const UPSTREAM_TIMEOUT_MS = 8000;

function corsHeaders(request, env) {
  const allowed = (env && env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS) : '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    Vary: 'Origin',
  };
}

function respond(body, { status = 200, type = 'application/json;charset=utf-8', ttl = 0, request, env }) {
  const headers = { ...corsHeaders(request, env), 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' };
  headers['Cache-Control'] = ttl > 0 ? `public, max-age=${ttl}` : 'no-store';
  return new Response(body, { status, headers });
}

function json(data, status, request, env, ttl = 0) {
  return respond(JSON.stringify(data), { status, ttl, request, env });
}

/** 上游抓取：固定 8 秒逾時，帶 UA，回傳 text。 */
async function upstream(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'HK-Traffic-Super-Screen/2.0 (+https://github.com/D-HKD)' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cf: { cacheTtl: 0 },
  });
  return response;
}

/**
 * 邊緣快取包裝：命中就即回，未命中就執行 produce 並寫入。
 * ctx.waitUntil 令寫入快取不會拖慢回應。
 */
async function edgeCached(request, cacheKey, ttl, ctx, produce) {
  const cache = caches.default;
  const key = new Request(cacheKey, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const response = await produce();
  if (response.ok) {
    const copy = response.clone();
    const headers = new Headers(copy.headers);
    headers.set('Cache-Control', `public, max-age=${ttl}`);
    const storable = new Response(copy.body, { status: copy.status, headers });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(key, storable));
  }
  return response;
}

async function fetchSchedule(station) {
  const url = `${UPSTREAM.schedule}?line=TML&sta=${station}&lang=TC`;
  const response = await upstream(url);
  if (!response.ok) throw new Error(`MTR ${station} HTTP ${response.status}`);
  return response.json();
}

async function handleRail(url, request, env, ctx) {
  const raw = (url.searchParams.get('stations') || '').toUpperCase();
  const stations = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))].filter((code) =>
    TML_STATIONS.has(code),
  );

  if (stations.length === 0) {
    return json({ ok: false, error: 'stations 必須是 TIS / LOP / YUL / SIH / TUM 的組合' }, 400, request, env);
  }

  const cacheKey = `${url.origin}/api/rail?stations=${stations.join(',')}`;
  return edgeCached(request, cacheKey, TTL.rail, ctx, async () => {
    const results = await Promise.allSettled(stations.map((station) => fetchSchedule(station)));
    const payload = {};
    const failed = [];
    results.forEach((result, index) => {
      const station = stations[index];
      if (result.status === 'fulfilled') {
        const block = result.value && result.value.data ? result.value.data[`TML-${station}`] : null;
        if (block) payload[station] = block;
        else failed.push(station);
      } else {
        failed.push(station);
      }
    });

    if (Object.keys(payload).length === 0) {
      return json({ ok: false, error: '所有車站都取不到', stations: {} }, 502, request, env);
    }
    return json({ ok: true, stations: payload, failed }, failed.length > 0 ? 200 : 200, request, env, TTL.rail);
  });
}

async function handleMtr(url, request, env, ctx) {
  const target = url.searchParams.get('url') || '';
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ ok: false, error: 'Invalid url' }, 400, request, env);
  }

  const okHost = parsed.protocol === 'https:' && parsed.hostname === 'rt.data.gov.hk';
  const okPath =
    parsed.pathname === '/v1/transport/mtr/getSchedule.php' ||
    parsed.pathname === '/v1/transport/mtr/lrt/getSchedule';
  if (!okHost || !okPath) {
    return json({ ok: false, error: 'Host 或路徑不在白名單' }, 403, request, env);
  }

  const cacheKey = `${url.origin}/mtr?url=${encodeURIComponent(parsed.toString())}`;
  return edgeCached(request, cacheKey, TTL.rail, ctx, async () => {
    const response = await upstream(parsed.toString());
    const body = await response.text();
    return respond(body, {
      status: response.status,
      type: 'application/json;charset=utf-8',
      ttl: TTL.rail,
      request,
      env,
    });
  });
}

async function handleWeather(request, env, ctx) {
  const cacheKey = `${new URL(request.url).origin}/weather`;
  return edgeCached(request, cacheKey, TTL.weather, ctx, async () => {
    const response = await upstream(UPSTREAM.weather);
    const body = await response.text();
    return respond(body, {
      status: response.status,
      type: 'application/json;charset=utf-8',
      ttl: TTL.weather,
      request,
      env,
    });
  });
}

async function handleTraffic(request, env, ctx) {
  const cacheKey = `${new URL(request.url).origin}/trafficnews`;
  return edgeCached(request, cacheKey, TTL.traffic, ctx, async () => {
    const response = await upstream(UPSTREAM.traffic);
    const body = await response.text();
    return respond(body, {
      status: response.status,
      type: 'application/xml;charset=utf-8',
      ttl: TTL.traffic,
      request,
      env,
    });
  });
}

/**
 * 車速：TD raw feed（709KB，每 30 秒）+ 探測器位置 CSV（172KB，6 小時快取）。
 * 兩者都經 caches.default 快取，所以全港用戶共用同一份，上游負載與人數無關。
 */
async function cachedText(url, ttlSeconds) {
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit.text();

  const response = await upstream(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  await cache.put(key, new Response(text, { headers: { 'Cache-Control': `public, max-age=${ttlSeconds}` } }));
  return text;
}

async function handleRoads(request, env, ctx) {
  const origin = new URL(request.url).origin;
  return edgeCached(request, `${origin}/api/roads`, TTL.roads, ctx, async () => {
    const [csv, xml] = await Promise.all([
      cachedText(UPSTREAM.tdDetectorInfo, TTL.info),
      cachedText(UPSTREAM.tdRawSpeed, TTL.roads),
    ]);
    const info = parseDetectorInfoCsv(csv);
    const { period, speeds } = parseRawSpeedXml(xml);
    const roads = aggregateSpeeds(ROAD_DEFS, info, speeds);
    return json({ ok: true, period, roads }, 200, request, env, TTL.roads);
  });
}
/** 九巴：一次聚合多個站（前端每個站 2-3 個站，只發一個請求）。 */
async function handleBus(url, request, env, ctx) {
  const raw = (url.searchParams.get('stops') || '').toUpperCase();
  const ids = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))].slice(0, 6);

  if (ids.length === 0 || ids.some((id) => !KMB_STOP_ID.test(id))) {
    return json({ ok: false, error: 'stops 必須是 16 位十六進制九巴站 ID（1-6 個）' }, 400, request, env);
  }

  const cacheKey = `${url.origin}/api/bus?stops=${ids.join(',')}`;
  return edgeCached(request, cacheKey, TTL.bus, ctx, async () => {
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const response = await upstream(`${UPSTREAM.kmbStopEta}/${id}`);
        if (!response.ok) throw new Error(`KMB ${id} HTTP ${response.status}`);
        return response.json();
      }),
    );

    const stops = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') stops[ids[index]] = result.value;
    });

    if (Object.keys(stops).length === 0) {
      return json({ ok: false, error: '所有巴士站都取不到' }, 502, request, env);
    }
    return json({ ok: true, stops }, 200, request, env, TTL.bus);
  });
}

/* ------------------------------------------------------------------ Web Push */

function pushConfig(env) {
  const publicKey = env && env.VAPID_PUBLIC_KEY;
  const privateKey = env && env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: (env && env.VAPID_SUBJECT) || 'mailto:admin@example.com' };
}

async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function handlePushKey(request, env) {
  const config = pushConfig(env);
  if (!config) return json({ ok: false, error: '未設定 VAPID，推送未啟用' }, 503, request, env);
  return json({ ok: true, key: config.publicKey }, 200, request, env);
}

async function handlePushSubscribe(request, env, ctx) {
  const config = pushConfig(env);
  const store = env && env.SUBSCRIPTIONS;
  if (!config || !store) return json({ ok: false, error: '推送未設定' }, 503, request, env);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body 不是 JSON' }, 400, request, env);
  }

  const endpoint = body && body.endpoint;
  const keys = body && body.keys;
  const validEndpoint = typeof endpoint === 'string' && endpoint.startsWith('https://');
  const validKeys =
    keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string' && keys.p256dh.length > 60;
  if (!validEndpoint || !validKeys) return json({ ok: false, error: '訂閱資料不完整' }, 400, request, env);

  const id = await subscriptionId(endpoint);
  const record = JSON.stringify({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    at: new Date().toISOString(),
  });
  ctx.waitUntil(store.put(`sub:${id}`, record));
  return json({ ok: true, id }, 200, request, env);
}

async function handlePushUnsubscribe(request, env) {
  const store = env && env.SUBSCRIPTIONS;
  if (!store) return json({ ok: false, error: '推送未設定' }, 503, request, env);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body 不是 JSON' }, 400, request, env);
  }
  const endpoint = body && body.endpoint;
  if (typeof endpoint !== 'string') return json({ ok: false, error: '缺少 endpoint' }, 400, request, env);

  await store.delete(`sub:${await subscriptionId(endpoint)}`);
  return json({ ok: true }, 200, request, env);
}

/** ⚠️ 臨時：發送一則測試推送（用完即刪）。 */
async function handlePushTest(url, request, env) {
  const TOKEN = 'ec2b04d76513';
  if ((url.searchParams.get('token') || '') !== TOKEN) {
    return json({ ok: false, error: 'forbidden' }, 403, request, env);
  }
  const config = pushConfig(env);
  const store = env && env.SUBSCRIPTIONS;
  if (!config || !store) return json({ ok: false, error: '推送未設定' }, 503, request, env);

  const payload = {
    title: '測試警報｜香港交通警報中心',
    body: '呢條係測試推送，證明背景通知已接通。之後只會推送真正嘅屯元天交通消息。',
    url: './#alerts',
    tag: `test-${Date.now()}`,
  };

  const list = await store.list({ prefix: 'sub:' });
  const results = [];
  for (const key of list.keys) {
    const record = await store.get(key.name);
    if (!record) continue;
    try {
      const subscription = JSON.parse(record);
      const response = await sendPush(subscription, payload, config);
      results.push({ host: new URL(subscription.endpoint).host, status: response.status, ok: response.ok });
      if (response.status === 404 || response.status === 410) await store.delete(key.name);
    } catch (error) {
      results.push({ host: '?', ok: false, error: String(error && error.message ? error.message : error) });
    }
  }
  return json({ ok: true, sent: results.length, results }, 200, request, env);
}
/** 極簡 XML 取值（Worker 冇 DOMParser）。 */
function pickTag(block, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return match ? match[1].trim() : '';
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseTrafficXml(xml) {
  const items = [];
  for (const block of xml.split('<message>').slice(1)) {
    const content = pickTag(block, 'CONTENT_CN');
    if (!content) continue;
    items.push({
      id: pickTag(block, 'ID') || pickTag(block, 'INCIDENT_NUMBER') || String(items.length),
      heading: pickTag(block, 'INCIDENT_HEADING_CN') || '交通消息',
      location: pickTag(block, 'LOCATION_CN'),
      content: decodeEntities(content),
    });
  }
  return items;
}

const DISTRICT_PATTERN = /屯門|元朗|天水圍|朗屏|兆康|洪水橋|青山公路|大欖/;

/** Cron：抓運輸署消息 → 對比上次見過的 ID → 有新而相關就推送。 */
async function runPushJob(env) {
  const config = pushConfig(env);
  const store = env && env.SUBSCRIPTIONS;
  if (!config || !store) return { skipped: 'not-configured' };

  const response = await upstream(UPSTREAM.traffic);
  if (!response.ok) return { skipped: `upstream ${response.status}` };
  const items = parseTrafficXml(await response.text());

  const seenRaw = await store.get('seen-ids');
  const seen = seenRaw ? JSON.parse(seenRaw) : [];
  const seenSet = new Set(Array.isArray(seen) ? seen : []);

  await store.put('seen-ids', JSON.stringify(items.map((item) => item.id).slice(0, 80)));

  const fresh = items.filter(
    (item) => !seenSet.has(item.id) && DISTRICT_PATTERN.test(`${item.heading} ${item.location} ${item.content}`),
  );
  // 「現已解封」係好消息，唔應該推送。
  const alertable = fresh.filter((item) => !/已解封|恢復通車/.test(item.content));
  if (alertable.length === 0) return { sent: 0, fresh: 0 };

  const top = alertable[0];
  const payload = {
    title: `香港交通警報｜${top.heading}`,
    body: `${top.location ? `${top.location}：` : ''}${top.content}`.slice(0, 170),
    url: './#alerts',
    tag: top.id,
  };

  const list = await store.list({ prefix: 'sub:' });
  let sent = 0;
  for (const key of list.keys) {
    const record = await store.get(key.name);
    if (!record) continue;
    try {
      const subscription = JSON.parse(record);
      const result = await sendPush(subscription, payload, config);
      if (result.status === 404 || result.status === 410) await store.delete(key.name);
      else sent += 1;
    } catch {
      /* 單一訂閱失敗不影響其他 */
    }
  }
  return { sent, fresh: alertable.length };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    // 大部分端點唯讀；只有推送訂閱／取消接受 POST。
    const pushWrite = url.pathname === '/api/push/subscribe' || url.pathname === '/api/push/unsubscribe';
    if (request.method !== 'GET' && !(request.method === 'POST' && pushWrite)) {
      return json({ ok: false, error: '此端點只支援 GET' }, 405, request, env);
    }

    try {
      switch (url.pathname) {
        case '/':
          return json(
            {
              ok: true,
              service: '香港交通警報中心 proxy',
              version: '2.2',
              endpoints: [
                '/api/rail?stations=TIS,LOP,YUL,SIH,TUM',
                '/api/bus?stops=<16-hex-kmb-stop-id>',
                '/api/bus/stops',
                '/api/roads',
                '/mtr?url=...',
                '/weather',
                '/trafficnews',
                '/api/push/key',
                '/api/push/subscribe',
                '/api/push/unsubscribe',
                '/health',
              ],
              ttl: TTL,
            },
            200,
            request,
            env,
          );
        case '/health':
          return json({ ok: true, now: new Date().toISOString() }, 200, request, env);
        case '/api/rail':
          return await handleRail(url, request, env, ctx);
        case '/api/bus':
          return await handleBus(url, request, env, ctx);
        case '/api/bus/stops':
          return await edgeCached(request, `${url.origin}/api/bus/stops`, TTL.info, ctx, async () =>
            json({ ok: true, stops: BUS_STOPS }, 200, request, env, TTL.info),
          );
        case '/api/roads':
          return await handleRoads(request, env, ctx);
        case '/api/push/key':
          return await handlePushKey(request, env);
        case '/api/push/subscribe':
          if (request.method !== 'POST') return json({ ok: false, error: '只支援 POST' }, 405, request, env);
          return await handlePushSubscribe(request, env, ctx);
        case '/api/push/unsubscribe':
          if (request.method !== 'POST') return json({ ok: false, error: '只支援 POST' }, 405, request, env);
          return await handlePushUnsubscribe(request, env);
        case '/mtr':
          return await handleMtr(url, request, env, ctx);
        case '/weather':
          return await handleWeather(request, env, ctx);
        case '/trafficnews':
          return await handleTraffic(request, env, ctx);
        default:
          return json({ ok: false, error: 'Not found' }, 404, request, env);
      }
    } catch (error) {
      const message = error && error.name === 'TimeoutError' ? '上游逾時' : String((error && error.message) || error);
      return json({ ok: false, error: message }, 502, request, env);
    }
  },

  /** Cron Trigger：每 5 分鐘檢查一次新交通消息並推送。 */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runPushJob(env)
        .then((result) => console.log('[push]', JSON.stringify(result)))
        .catch((error) => console.error('[push] 失敗', String(error && error.message ? error.message : error))),
    );
  },
};
