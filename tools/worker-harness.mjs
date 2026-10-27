/**
 * 本地 Worker harness（開發用，不參與 build）。
 *
 * 直接 import worker/src/index.js 並用 node:http 包一層，令瀏覽器可以打到真正嘅
 * worker 程式碼（包括 /api/bus、邊緣快取邏輯），唔需要 wrangler 或 Cloudflare 帳號。
 *
 * 用法：
 *   node tools/worker-harness.mjs            # 監聽 8799
 *   VITE_PROXY_BASE=http://localhost:8799 pnpm build
 *
 * 只快取、不持久化；沒有 KV 綁定，所以 /api/push/* 會回 503（與未設定時的行為一致）。
 */
import { createServer } from 'node:http';

import worker from '../worker/src/index.js';

const PORT = Number(process.env.PORT ?? 8799);

/** 最小 caches.default 實作：把 body 存成 bytes，避免 stream 被重複讀取。 */
const cacheStore = new Map();
globalThis.caches = {
  default: {
    async match(key) {
      const entry = cacheStore.get(typeof key === 'string' ? key : key.url);
      if (!entry) return undefined;
      return new Response(entry.body, { status: entry.status, headers: entry.headers });
    },
    async put(key, response) {
      const url = typeof key === 'string' ? key : key.url;
      const body = Buffer.from(await response.clone().arrayBuffer());
      cacheStore.set(url, { body, status: response.status, headers: [...response.headers] });
    },
  },
};

const env = {};
const ctx = { waitUntil: (promise) => void promise.catch(() => undefined) };

const server = createServer(async (request, response) => {
  const origin = `http://localhost:${PORT}`;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  const init = {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  };

  try {
    const result = await worker.fetch(new Request(origin + request.url, init), env, ctx);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end(String(error && error.stack ? error.stack : error));
  }
});

server.listen(PORT, () => {
  console.log(`worker harness listening on http://localhost:${PORT}`);
});
