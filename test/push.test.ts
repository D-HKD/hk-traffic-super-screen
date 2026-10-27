import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64urlToBytes, bytesToB64url, encryptPayload, vapidJwt } from '../worker/src/push.js';

const encoder = new TextEncoder();

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

/** 產生一組「瀏覽器端」的訂閱金鑰（測試用）。 */
async function makeSubscription() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    keys,
    uaPublic: rawPublic,
    subscription: {
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: bytesToB64url(rawPublic), auth: bytesToB64url(auth) },
    },
    authSecret: auth,
  };
}

test('RFC 8291：加密後的內容可以用訂閱者私鑰解返', async () => {
  const { keys, uaPublic, subscription, authSecret } = await makeSubscription();
  const plaintext = encoder.encode(JSON.stringify({ title: '測試', body: '屯門公路有事故' }));

  const body = await encryptPayload(subscription, plaintext);

  // 解析 aes128gcm 標頭
  const salt = body.slice(0, 16);
  const idlen = body[20];
  assert.equal(idlen, 65, 'keyid 長度應該係 65（未壓縮 P-256 公鑰）');
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  assert.ok(salt.length === 16 && asPublic[0] === 0x04);

  // 用訂閱者私鑰做 ECDH
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, keys.privateKey, 256),
  );

  const ikm = await hkdf(ecdhSecret, authSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext),
  );

  // 最後一個 byte 應為 padding delimiter 0x02
  assert.equal(decrypted[decrypted.length - 1], 2);
  const text = new TextDecoder().decode(decrypted.slice(0, decrypted.length - 1));
  assert.deepEqual(JSON.parse(text), { title: '測試', body: '屯門公路有事故' });
});

test('每次加密都用新 salt 同新臨時金鑰（唔會重複）', async () => {
  const { subscription } = await makeSubscription();
  const payload = encoder.encode('same');
  const first = await encryptPayload(subscription, payload);
  const second = await encryptPayload(subscription, payload);
  assert.notDeepEqual(first.slice(0, 16), second.slice(0, 16), 'salt 應該唔同');
  assert.notDeepEqual(first.slice(21, 86), second.slice(21, 86), '臨時公鑰應該唔同');
});

test('VAPID JWT 簽名可以用對應公鑰驗證', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));

  const publicKey = bytesToB64url(rawPublic);
  const privateKey = jwk.d;
  assert.ok(privateKey);

  const token = await vapidJwt({ audience: 'https://fcm.googleapis.com', subject: 'mailto:test@example.com', publicKey, privateKey });
  const [header, payload, signature] = token.split('.');
  assert.ok(header && payload && signature);

  const decodedHeader = JSON.parse(new TextDecoder().decode(b64urlToBytes(header)));
  assert.deepEqual(decodedHeader, { typ: 'JWT', alg: 'ES256' });

  const decodedPayload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
  assert.equal(decodedPayload.aud, 'https://fcm.googleapis.com');
  assert.equal(decodedPayload.sub, 'mailto:test@example.com');
  assert.ok(decodedPayload.exp > Date.now() / 1000);

  const verifyKey = await crypto.subtle.importKey('raw', rawPublic, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    b64urlToBytes(signature),
    encoder.encode(`${header}.${payload}`),
  );
  assert.equal(valid, true, 'JWT 簽名應通過驗證');
});

test('公鑰長度不對要即刻拋錯，唔好靜靜失敗', async () => {
  await assert.rejects(
    () => vapidJwt({ audience: 'https://x', subject: 'mailto:a@b.c', publicKey: bytesToB64url(new Uint8Array(10)), privateKey: 'AAAA' }),
    /65 bytes/,
  );
});
