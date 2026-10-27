import type { BusArrival } from './types';
import { isRecord, numberOrNull, optionalText, record } from '../lib/validate';
import { busStopsFor } from '../core/places';
import { HttpError, getJson, type RequestOptions } from './client';

/**
 * 九巴（KMB）到站資料。
 *
 * 端點：data.etabus.gov.hk/v1/transport/kmb/stop-eta/{stop_id}
 * 每個站會回傳該站所有路線、每條路線最多 3 個 eta_seq；eta 可能係 null（暫無服務）。
 * 這裡只保留「下一個到站」並按路線＋目的地去重，避免同一個站列十幾行。
 */

const MAX_ROWS = 7;

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
    if (!route || !eta) continue; // 冇 eta 代表暫時冇班次，唔顯示
    const minutes = minutesUntil(eta, now);
    if (minutes === null) continue;
    const seq = numberOrNull(entry['eta_seq']);
    // 每條路線只需要最近一班：eta_seq = 1 就係下一班。
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

/**
 * 一個請求拿齊所選輕鐵站附近所有巴士站（Worker 端並行打九巴）。
 * 回傳已合併、按到站時間排序的前 N 班。
 */
export async function fetchBusArrivals(
  stationCode: string,
  now: Date,
  options: RequestOptions,
): Promise<readonly BusArrival[]> {
  const stops = busStopsFor(stationCode);
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
