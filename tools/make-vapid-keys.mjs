/**
 * 產生 Web Push 用的 VAPID 金鑰（P-256），直接輸出 Cloudflare Worker 要的格式。
 *
 * 用法：
 *   node tools/make-vapid-keys.mjs
 *
 * 然後：
 *   npx wrangler secret put VAPID_PUBLIC_KEY     # 貼第一行
 *   npx wrangler secret put VAPID_PRIVATE_KEY    # 貼第二行
 *
 * 唔需要安裝 web-push 或任何依賴，只用 node:crypto。
 * 金鑰只用一次；如果重新產生，舊訂閱會失效（需要重新訂閱）。
 */

import { generateKeyPairSync } from 'node:crypto';

const b64url = (buffer) =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlToBuffer = (value) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  console.error('無法匯出 JWK，請確認 Node 版本（需 16+）。');
  process.exit(1);
}

// 未壓縮點：0x04 || X(32) || Y(32) = 65 bytes，Cloudflare 同瀏覽器都食呢個格式。
const rawPublic = Buffer.concat([Buffer.from([0x04]), b64urlToBuffer(publicJwk.x), b64urlToBuffer(publicJwk.y)]);

if (rawPublic.length !== 65) {
  console.error(`公鑰長度應為 65 bytes，實際 ${rawPublic.length}`);
  process.exit(1);
}

console.log('');
console.log('VAPID_PUBLIC_KEY=' + b64url(rawPublic));
console.log('VAPID_PRIVATE_KEY=' + privateJwk.d);
console.log('');
console.log('（上面兩行直接貼去 wrangler secret put，唔好 commit 入 git）');
