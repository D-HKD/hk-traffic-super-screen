import { proxyBase } from './api/client';

/**
 * Web Push 訂閱管理。
 *
 * 金鑰由 Worker 的 /api/push/key 提供；如果 Worker 未設定 VAPID，會回 503，
 * 這裡就回傳 'unconfigured'，UI 會如實顯示「伺服器未啟用推送」而唔會假裝成功。
 */

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'idle' | 'subscribed';

function base64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** 等到有 service worker，但唔想無限等（例如 dev server 冇註冊 SW）。 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration('./');
  if (existing) return existing;
  return Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
}

async function fetchKey(): Promise<string | null> {
  try {
    const response = await fetch(`${proxyBase()}/api/push/key`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return null;
    const key = (payload as Record<string, unknown>)['key'];
    return typeof key === 'string' && key.length > 60 ? key : null;
  } catch {
    return null;
  }
}

export async function currentPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.getRegistration('./');
  const existing = registration ? await registration.pushManager.getSubscription() : null;
  if (existing) return 'subscribed';

  return (await fetchKey()) ? 'idle' : 'unconfigured';
}

export async function subscribePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';

  const key = await fetchKey();
  if (!key) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await activeRegistration();
  if (!registration) return 'unsupported';

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64urlToBytes(key) as unknown as BufferSource,
    }));

  await fetch(`${proxyBase()}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  return 'subscribed';
}

export async function unsubscribePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';

  const registration = await navigator.serviceWorker.getRegistration('./');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (!subscription) return 'idle';

  try {
    await fetch(`${proxyBase()}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch {
    /* 伺服器清唔到都要照取消本機訂閱 */
  }

  await subscription.unsubscribe();
  return 'idle';
}
