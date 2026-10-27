import type { BusArrival } from './types';
import { isRecord, numberOrNull, optionalText, record } from '../lib/validate';
import { HttpError, getJson, type RequestOptions } from './client';

/**
 * 九巴（KMB）到站資料。
 *
 * 端點：data.etabus.gov.hk/v1/transport/kmb/stop-eta/{stop_id}
 * 每個站會回傳該站所有路線、每條路線最多 3 個 eta_seq；eta 可能係 null（暫無服務）。
 * 這裡只保留「下一個到站」並按路線＋目的地去重。
 */

const MAX_ROWS = 7;

export interface BusStopOption {
  readonly id: string;
  readonly name: string;
  readonly area: string;
}

export interface BusStopRef {
  readonly id: string;
  readonly name: string;
  readonly meters?: number;
}

let stopsPromise: Promise<readonly BusStopOption[]> | null = null;

/** 屯元天全部巴士站（1015 個），第一次呼叫才下載，之後快取在記憶體。 */
export function loadBusStops(options: RequestOptions = {}): Promise<readonly BusStopOption[]> {
  if (stopsPromise) return stopsPromise;
  stopsPromise = getJson(
    '/api/bus/stops',
    {},
    (raw) => {
      const root = record(raw, '巴士站清單');
      const list = root['stops'];
      if (!Array.isArray(list)) throw new Error('巴士站清單格式錯誤');
      const out: BusStopOption[] = [];
      for (const entry of list) {
        if (!Array.isArray(entry)) continue;
        const [id, name, area] = entry;
        if (typeof id !== 'string' || typeof name !== 'string') continue;
        out.push({ id, name, area: typeof area === 'string' ? area : '' });
      }
      return out;
    },
    options,
  ).catch((error: unknown) => {
    stopsPromise = null;
    throw error;
  });
  return stopsPromise;
}

function minutesUntil(iso: string, now: Date): number | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const diff = Math.round((at.getTime() - now.getTime()) / 60_000);
  return diff < 0 ? 0 : diff;
}

export function parseStopEta(payload: unknown, stop: { id: string; name: string }, now: Date): BusArrival[] {
  const root = record(payload, '九巴回應');
  const data = root['data'];
  if (!Array.isArray(data)) return [];

  const rows: BusArrival[] = [];
  for (const entry of data) {
    if (!isRecord(entry)) continue;
    const route = optionalText(entry['route'], 'route');
    const eta = optionalText(entry['eta'], 'eta');
    if (!route || !eta) continue;
    const minutes = minutesUntil(eta, now);
    if (minutes === null) continue;
    const seq = numberOrNull(entry['eta_seq']);
    if (seq !== null && seq > 1) continue;
    rows.push({
      route,
      dest: optionalText(entry['dest_tc'], 'dest_tc') ?? '',
      minutes,
      stop: stop.name,
      stopId: stop.id,
      operator: optionalText(entry['co'], 'co') ?? 'KMB',
    });
  }

  rows.sort((a, b) => a.minutes - b.minutes);
  const seen = new Set<string>();
  const deduped: BusArrival[] = [];
  for (const row of rows) {
    const key = `${row.route}|${row.dest}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

/** 一個請求拿齊指定巴士站（Worker 端並行打九巴）。 */
export async function fetchBusArrivals(
  stops: readonly BusStopRef[],
  now: Date,
  options: RequestOptions,
): Promise<readonly BusArrival[]> {
  if (stops.length === 0) return [];

  let payload: Record<string, unknown>;
  try {
    payload = await getJson(
      '/api/bus',
      { stops: stops.map((stop) => stop.id).join(',') },
      (raw) => {
        const root = record(raw, '巴士聚合回應');
        return record(root['stops'], '巴士聚合回應.stops');
      },
      options,
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new Error('伺服器未支援巴士查詢（/api/bus 404），請重新部署 Worker');
    }
    throw error;
  }

  const merged: BusArrival[] = [];
  for (const stop of stops) {
    const rows = payload[stop.id];
    if (rows === undefined) continue;
    merged.push(...parseStopEta(rows, stop, now));
  }

  merged.sort((a, b) => a.minutes - b.minutes);
  const seen = new Set<string>();
  const deduped: BusArrival[] = [];
  for (const row of merged) {
    const key = `${row.route}|${row.dest}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped.slice(0, MAX_ROWS);
}