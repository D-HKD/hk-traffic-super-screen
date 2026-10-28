import { isRecord, minutesFrom, optionalText, record, text } from '../lib/validate.ts';
import { parseHkDateTime } from '../lib/format.ts';
import { getJson, type RequestOptions } from './client.ts';
import type { Arrival, Direction, StationArrivals } from './types.ts';

import { TML_STATIONS } from '../config.ts';
import { settleAll } from '../lib/promise.ts';

export { TML_STATIONS };

export type TmlCode = (typeof TML_STATIONS)[number]['code'];

export const TML_CODES: readonly TmlCode[] = TML_STATIONS.map((s) => s.code);

const DEST_LABELS: Readonly<Record<string, string>> = { WKS: '烏溪沙', TUM: '屯門' };

const MAX_PER_DIRECTION = 3;

function destLabel(code: string): string {
  return DEST_LABELS[code] ?? code;
}

function parseDirection(raw: unknown, dir: Direction, path: string): Arrival[] {
  const out: Arrival[] = [];
  // 終點站（例如屯門）可能只有一個方向有班次，缺方向係正常情況，唔當錯誤。
  if (!Array.isArray(raw)) return out;
  const entries = raw;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!isRecord(entry)) continue;
    if (text(entry['valid'], `${path}[${i}].valid`) === 'N') continue;
    const minutes = minutesFrom(entry['ttnt']);
    if (minutes === null) continue;
    const destCode = text(entry['dest'], `${path}[${i}].dest`);
    out.push({
      dir,
      destCode,
      destLabel: destLabel(destCode),
      platform: text(entry['plat'], `${path}[${i}].plat`),
      minutes,
    });
  }
  out.sort((a, b) => a.minutes - b.minutes);
  // 同一目的地只留最近一班，避免「往屯門 0 / 往屯門 0」重複。
  const seen = new Set<string>();
  const deduped: Arrival[] = [];
  for (const arrival of out) {
    if (seen.has(arrival.destCode)) continue;
    seen.add(arrival.destCode);
    deduped.push(arrival);
  }
  return deduped.slice(0, MAX_PER_DIRECTION);
}

/**
 * 解析 MTR getSchedule 回應。
 * 缺站（例如服務暫停）時回傳空班次而不是拋錯，讓 UI 可以講「暫時無班次」而非「出錯」。
 */
export function parseTmlSchedule(payload: unknown, station: string): StationArrivals {
  const name = TML_STATIONS.find((s) => s.code === station)?.name ?? station;
  const empty: StationArrivals = { station, name, up: [], down: [], serverTime: null };

  const root = record(payload, 'MTR 回應');
  const data = root['data'];
  if (!isRecord(data)) return empty;

  const block = data[`TML-${station}`];
  if (!isRecord(block)) return empty;

  const serverTime = (() => {
    const raw = optionalText(block['curr_time'], 'curr_time') ?? optionalText(root['curr_time'], 'curr_time');
    return raw ? parseHkDateTime(raw) : null;
  })();

  return {
    station,
    name,
    up: parseDirection(block['UP'], 'UP', 'UP'),
    down: parseDirection(block['DOWN'], 'DOWN', 'DOWN'),
    serverTime,
  };
}

/**
 * v2 Worker 提供 `/api/rail` 聚合端點（一次請求拿三個站）。
 * 若部署的是舊版 Worker（會 404），記住結果，之後直接走逐站請求，不再浪費一次 round trip。
 */
let aggregateSupported: boolean | null = null;

async function fetchAggregate(codes: readonly string[], options: RequestOptions): Promise<Map<string, StationArrivals>> {
  const payload = await getJson(
    '/api/rail',
    { stations: codes.join(',') },
    (raw) => {
      const root = record(raw, '聚合回應');
      return record(root['stations'], '聚合回應.stations');
    },
    options,
  );
  const map = new Map<string, StationArrivals>();
  for (const code of codes) {
    const stationPayload = payload[code];
    if (stationPayload === undefined) continue;
    // Worker 回傳的是 `data["TML-<code>"]` 本身，所以要包回 MTR 的原始形狀再解析。
    map.set(code, parseTmlSchedule({ status: 1, data: { [`TML-${code}`]: stationPayload } }, code));
  }
  return map;
}

async function fetchStation(code: string, options: RequestOptions): Promise<StationArrivals> {
  const target = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TML&sta=${code}&lang=TC`;
  return getJson('/mtr', { url: target }, (raw) => parseTmlSchedule(raw, code), options);
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * 逐站請求。MTR 對短時間內多個並行請求偶爾會回 429／逾時，
 * 所以失敗的站會再試一次（單次、短延遲），避免因為一個站拖到整塊面板空白。
 */
async function fetchPerStation(codes: readonly string[], options: RequestOptions): Promise<Map<string, StationArrivals>> {
  const map = new Map<string, StationArrivals>();
  const failed: string[] = [];

  const first = await settleAll(codes.map((code) => fetchStation(code, options)));
  first.forEach((result, index) => {
    const code = codes[index];
    if (!code) return;
    if (result.status === 'fulfilled') map.set(code, result.value);
    else failed.push(code);
  });

  if (failed.length > 0 && !options.signal?.aborted) {
    await delay(400, options.signal);
    const retry = await settleAll(failed.map((code) => fetchStation(code, options)));
    retry.forEach((result, index) => {
      const code = failed[index];
      if (code && result.status === 'fulfilled') map.set(code, result.value);
    });
  }

  if (map.size === 0) throw new Error('屯馬綫三個站都取不到');
  if (map.size < codes.length) {
    const missing = codes.filter((code) => !map.has(code));
    throw new PartialFailureError(`部分車站失敗：${missing.join(', ')}`, map);
  }
  return map;
}

/** 部分成功：仍然有資料可以畫，但要標示「部分更新」。 */
export class PartialFailureError extends Error {
  readonly partial: Map<string, StationArrivals>;
  constructor(message: string, partial: Map<string, StationArrivals>) {
    super(message);
    this.name = 'PartialFailureError';
    this.partial = partial;
  }
}

export async function fetchTmlBatch(
  codes: readonly string[],
  options: RequestOptions,
): Promise<Map<string, StationArrivals>> {
  if (aggregateSupported !== false) {
    try {
      const map = await fetchAggregate(codes, options);
      aggregateSupported = true;
      return map;
    } catch (error) {
      if (error instanceof Error && /HTTP 404/.test(error.message)) {
        aggregateSupported = false;
      }
    }
  }
  return fetchPerStation(codes, options);
}
