import { isRecord, minutesFrom, numberOrNull, text } from '../lib/validate';
import type { RequestOptions } from './client';
import { getJson } from './client';
import type { LrtRow } from './types';

/**
 * 輕鐵站同該站要顯示的路線。舊版把「該站所有路線」直接列出，
 * 會出現同一路線往唔同目的地重複佔位；這裡先按路線白名單過濾再按目的地去重。
 */
export { LRT_GROUPS } from '../config';

import { LRT_GROUPS } from '../config';

const MAX_ROWS = 8;

export function parseLrtSchedule(payload: unknown, group: (typeof LRT_GROUPS)[number]): LrtRow[] {
  if (!isRecord(payload)) return [];
  const platforms = payload['platform_list'];
  if (!Array.isArray(platforms)) return [];

  const rows: LrtRow[] = [];
  for (const platform of platforms) {
    if (!isRecord(platform)) continue;
    const platformId = text(platform['platform_id'], 'platform_id');
    const routeList = platform['route_list'];
    if (!Array.isArray(routeList)) continue;

    for (const raw of routeList) {
      if (!isRecord(raw)) continue;
      const route = text(raw['route_no'], 'route_no');
      if (!(group.routes as readonly string[]).includes(route)) continue;
      const minutes = minutesFrom(raw['time_ch']);
      if (minutes === null) continue;
      // train_length 由官方直接提供：1 = 單卡，2 = 雙卡。缺失就留 null，寧願唔顯示都唔好亂猜。
      const length = numberOrNull(raw['train_length']);
      const cars: 1 | 2 | null = length === null ? null : length >= 2 ? 2 : 1;
      rows.push({
        route,
        dest: text(raw['dest_ch'], 'dest_ch') || text(raw['dest_en'], 'dest_en'),
        platform: platformId,
        minutes,
        station: group.station,
        cars,
      });
    }
  }

  rows.sort((a, b) => a.minutes - b.minutes);
  // 同一路線／同一目的地只留最近一班，避免「705 2 分鐘」「705 9 分鐘」重複佔位。
  const seen = new Set<string>();
  const deduped: LrtRow[] = [];
  for (const row of rows) {
    const key = `${row.route}|${row.dest}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

/**
 * 只抓指定車站（68 個站全抓會變成每 30 秒 68 個請求，絕對唔可以）。
 * 呼叫方傳入「目前選中」嘅站號（通常 1 個）。
 */
export async function fetchLrtStations(codes: readonly string[], options: RequestOptions): Promise<LrtRow[]> {
  const groups = LRT_GROUPS.filter((group) => codes.includes(group.station));
  if (groups.length === 0) return [];

  const results = await Promise.allSettled(
    groups.map(async (group) => {
      const target = `https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=${group.station}&with_special=1`;
      return getJson('/mtr', { url: target }, (raw) => parseLrtSchedule(raw, group), options);
    }),
  );

  const rows: LrtRow[] = [];
  let failures = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else failures += 1;
  }
  if (rows.length === 0 && failures > 0) throw new Error('輕鐵班次暫時取不到');
  rows.sort((a, b) => a.minutes - b.minutes);
  return rows.slice(0, MAX_ROWS);
}