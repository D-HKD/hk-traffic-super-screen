/**
 * Web Push（VAPID + RFC 8291 aes128gcm）純函式實作。
 *
 * 為什麼自己寫而唔用套件：Worker 一個依賴都不想引入，而且呢兩個演算法其實幾短；
 * 另外 `test/push.test.ts` 會做一次完整 round-trip（自己加密、自己解密），
 * 所以呢啲密碼學代碼唔會係「寫完未驗證」。
 */

const encoder = new TextEncoder();

/** base64url → Uint8Array */
export function b64urlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Uint8Array → base64url（冇 padding） */
export function bytesToB64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(ikm, salt, info, length) {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, base, length * 8);
  return new Uint8Array(bits);
}

/**
 * VAPID JWT（ES256）。
 * @param {{ audience: string, subject: string, publicKey: string, privateKey: string, now?: number }} options
 *   publicKey / privateKey 為 base64url；privateKey 係 P-256 的 32-byte 純量 d。
 */
export async function vapidJwt({ audience, subject, publicKey, privateKey, now = Date.now() }) {
  const pub = b64urlToBytes(publicKey);
  if (pub.length !== 65) throw new Error('VAPID 公鑰必須是 65 bytes 的未壓縮 P-256 點');

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKey,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
  };

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(
    encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput));

  return `${signingInput}.${bytesToB64url(new Uint8Array(signature))}`;
}

/**
 * RFC 8291 加密：aes128gcm。
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {Uint8Array} plaintext
 * @returns {Promise<Uint8Array>} 可直接作為 request body
 */
export async function encryptPayload(subscription, plaintext) {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh);
  const authSecret = b64urlToBytes(subscription.keys.auth);
  if (uaPublic.length !== 65) throw new Error('p256dh 必須是 65 bytes 的未壓縮 P-256 點');

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256),
  );

  // RFC 8291 §3.4：先以 auth secret 做 HKDF，再以 salt 派生 CEK / nonce
  const ikm = await hkdf(ecdhSecret, authSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 = 最後一筆記錄的 padding delimiter
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** 發送一則推送。回傳 Response，呼叫方負責處理 404／410（訂閱已失效）。 */
export async function sendPush(subscription, payload, vapid, ttl = 900) {
  const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(payload)));
  const token = await vapidJwt({
    audience: new URL(subscription.endpoint).origin,
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  });

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(ttl),
      Urgency: 'normal',
      Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
    },
    body,
  });
}
