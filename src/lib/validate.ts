/**
 * 極小的執行期驗證工具。
 *
 * 目的：政府 API 隨時會改欄位名或型別。舊版用 `j?.data?.['TML-'+sta]` 直接深入取值，
 * 一改就靜靜變成 undefined，用戶只見到「載入中…」永遠。
 * 這裡所有取值都要經過型別檢查，錯誤會帶住路徑講清楚邊一層出事。
 */

export class ShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShapeError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ShapeError(`${path} 應為物件，實際為 ${describe(value)}`);
  return value;
}

export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError(`${path} 應為陣列，實際為 ${describe(value)}`);
  return value;
}

/** 只讀字串；undefined／null 當成空字串，其他型別視為錯誤。 */
export function text(value: unknown, path: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new ShapeError(`${path} 應為字串，實際為 ${describe(value)}`);
}

/** 只讀可選欄位，缺失時回 undefined。 */
export function optionalText(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, path);
}

/** 數字或數字字串 → number；不能解析時回 null（視為「無資料」，不視為錯誤）。 */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const m = /-?\d+(?:\.\d+)?/.exec(value.trim());
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function number(value: unknown, path: string): number {
  const n = numberOrNull(value);
  if (n === null) throw new ShapeError(`${path} 應為數字，實際為 ${describe(value)}`);
  return n;
}

/** 把 "6 分鐘" / "6 mins" / "6" 統一成 6；無法解析回 null。 */
export function minutesFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw === '' || raw === '-') return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /(\d+)\s*(?:min|mins|minute|minutes|分鐘|分)/i.exec(raw);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `陣列(${value.length})`;
  return typeof value;
}
