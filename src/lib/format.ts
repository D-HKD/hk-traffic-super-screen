/** 時間、到站分鐘、相對時間的純函式；全部可在 node 測試。 */

const HK_LOCALE = 'zh-HK';

export function clockText(date: Date): string {
  return date.toLocaleTimeString(HK_LOCALE, { hour12: false });
}

export function dateText(date: Date): string {
  return date.toLocaleDateString(HK_LOCALE, { month: 'numeric', day: 'numeric', weekday: 'short' });
}

/** 秒級相對時間：剛剛 / 42 秒前 / 3 分鐘前 / 2 小時前。 */
export function agoText(from: Date | null, now: Date): string {
  if (!from) return '未有資料';
  const sec = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (sec < 5) return '剛剛';
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 日前`;
}

export type Eta = { readonly value: string; readonly unit: string; readonly due: boolean };

/** 到站分鐘 → 顯示文字。0／1 分鐘統一顯示「即將」。 */
export function etaText(minutes: number | null): Eta {
  if (minutes === null) return { value: '--', unit: '', due: false };
  if (minutes <= 1) return { value: '即將', unit: '', due: true };
  return { value: String(minutes), unit: '分鐘', due: false };
}

/** 資料新鮮度：超過 staleAfterMs 就視為過期（黃色），超過 deadAfterMs 視為失聯（紅色）。 */
export type Freshness = 'ok' | 'stale' | 'dead';
export function freshness(updatedAt: Date | null, now: Date, staleAfterMs: number, deadAfterMs: number): Freshness {
  if (!updatedAt) return 'dead';
  const age = now.getTime() - updatedAt.getTime();
  if (age > deadAfterMs) return 'dead';
  if (age > staleAfterMs) return 'stale';
  return 'ok';
}

/** 把「2026-10-27T10:23:00」這種無時區字串按香港時間解讀。 */
export function parseHkDateTime(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec ?? '0'));
}

export function distanceText(km: number): string {
  if (!Number.isFinite(km)) return '--';
  return km < 1 ? `${Math.round(km * 1000)} 米` : `${km.toFixed(1)} 公里`;
}
