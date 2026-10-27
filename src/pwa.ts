/**
 * Service worker 註冊。
 * 只有當瀏覽器支援、並且不是 dev server 時才註冊，避免開發時被舊快取干擾。
 */
export function registerServiceWorker(onUpdate: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdate();
          });
        });
      })
      .catch((error: unknown) => {
        console.warn('[pwa] service worker 註冊失敗', error);
      });
  });
}
