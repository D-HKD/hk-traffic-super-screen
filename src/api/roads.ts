import type { RoadDirectionSpeed, RoadSnapshot, RoadSpeed } from './types';
import { HttpError, getJson, type RequestOptions } from './client';
import { isRecord, numberOrNull, optionalText, record, text } from '../lib/validate';

/** Worker 已把 709KB 的原始 feed 濃縮成 4 條路；前端只需要驗證再用。 */
export function parseRoadSnapshot(payload: unknown): RoadSnapshot {
  const root = record(payload, '車速回應');
  const roads = record(root['roads'], '車速回應.roads');
  const period = optionalText(root['period'], 'period') ?? null;

  const list: RoadSpeed[] = [];
  for (const [id, raw] of Object.entries(roads)) {
    if (!isRecord(raw)) continue;
    const dirs: RoadDirectionSpeed[] = [];
    const rawDirs = raw['dirs'];
    if (Array.isArray(rawDirs)) {
      for (const entry of rawDirs) {
        if (!isRecord(entry)) continue;
        const dir = optionalText(entry['dir'], `roads.${id}.dirs.dir`);
        const dirKmh = numberOrNull(entry['kmh']);
        if (!dir || dirKmh === null) continue;
        dirs.push({ dir, kmh: dirKmh, detectors: numberOrNull(entry['detectors']) ?? 0 });
      }
    }

    list.push({
      id,
      name: text(raw['name'], `roads.${id}.name`) || id,
      kmh: numberOrNull(raw['kmh']),
      detectors: numberOrNull(raw['detectors']) ?? 0,
      dirs,
    });
  }
  return { period, roads: list };
}

export async function fetchRoadSpeeds(options: RequestOptions): Promise<RoadSnapshot> {
  try {
    return await getJson('/api/roads', {}, parseRoadSnapshot, options);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new Error('伺服器未支援車速查詢（/api/roads 404），請重新部署 Worker');
    }
    throw error;
  }
}
