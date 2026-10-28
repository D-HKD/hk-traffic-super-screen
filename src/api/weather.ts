import { attempt, isRecord, numberOrNull, optionalText, record, text } from '../lib/validate.ts';
import { parseHkDateTime } from '../lib/format.ts';
import { nearestHkoStation } from '../core/geo.ts';
import { textOrJoined } from '../core/hko.ts';
import type { RequestOptions } from './client.ts';
import { getJson } from './client.ts';
import type { WeatherReading } from './types.ts';

const HKO_DEFAULT = '香港天文台';

function readings(payload: unknown, key: string): Record<string, unknown>[] {
  const root = record(payload, '天氣回應');
  const block = root[key];
  if (!isRecord(block)) return [];
  const data = block['data'];
  if (!Array.isArray(data)) return [];
  return data.filter(isRecord);
}

function pickByPlace(
  list: readonly Record<string, unknown>[],
  wanted: string | null,
): Record<string, unknown> | undefined {
  if (wanted) {
    const hit = list.find((row) => text(row['place'], 'place').includes(wanted));
    if (hit) return hit;
  }
  return list.find((row) => text(row['place'], 'place') === HKO_DEFAULT) ?? list[0];
}

/**
 * 解析 HKO rhrread。
 *
 * 每個欄位獨立解析：任何一個欄位型別突變（例如 warningMessage 由字串變陣列）
 * 只會令該欄位變 null，其餘照樣顯示，並把欄位名記入 `issues` 讓 UI 如實標示。
 * 唔會再出現「有警告嗰日連溫度都冇」呢種情況。
 */
export function parseWeather(payload: unknown, preferredStation: string | null): WeatherReading {
  const issues: string[] = [];

  const temps = attempt(() => readings(payload, 'temperature'), [], issues, 'temperature');
  const hums = attempt(() => readings(payload, 'humidity'), [], issues, 'humidity');
  const rains = attempt(() => readings(payload, 'rainfall'), [], issues, 'rainfall');
  const uvs = attempt(() => readings(payload, 'uvindex'), [], issues, 'uvindex');

  const tempRow = attempt(() => pickByPlace(temps, preferredStation), undefined, issues, 'temperature.place');
  const tempC = tempRow ? numberOrNull(tempRow['value']) : null;
  const station = tempRow
    ? attempt(() => text(tempRow['place'], 'place'), HKO_DEFAULT, issues, 'temperature.place') || HKO_DEFAULT
    : HKO_DEFAULT;

  const humidity = (() => {
    const row = attempt(
      () => hums.find((entry) => text(entry['place'], 'place') === HKO_DEFAULT) ?? hums[0],
      undefined,
      issues,
      'humidity.place',
    );
    return row ? numberOrNull(row['value']) : null;
  })();

  const rainMaxMm = attempt(
    () =>
      rains.reduce<number | null>((max, row) => {
        const value = numberOrNull(row['max']);
        if (value === null) return max;
        return max === null || value > max ? value : max;
      }, null),
    null,
    issues,
    'rainfall.max',
  );

  const uvRow = uvs[0];
  const uvDesc = uvRow ? attempt(() => text(uvRow['desc'], 'desc') || null, null, issues, 'uvindex.desc') : null;

  // textOrJoined 本身已經處理字串／陣列／其他型別，唔會拋錯。
  const warning = textOrJoined(payload && isRecord(payload) ? payload['warningMessage'] : null);
  const tip = textOrJoined(payload && isRecord(payload) ? payload['tcmessage'] : null);

  const observedRaw = attempt(
    () => (isRecord(payload) ? optionalText(payload['updateTime'], 'updateTime') : undefined),
    undefined,
    issues,
    'updateTime',
  );

  return {
    station,
    tempC,
    humidity,
    rainMaxMm,
    uvDesc,
    warning: warning ?? tip,
    observedAt: observedRaw ? parseHkDateTime(observedRaw) : null,
    issues,
  };
}

/** 優先用 GPS 最近的觀測站，未定位時用香港天文台。 */
export async function fetchWeather(
  coords: { lat: number; lon: number } | null,
  options: RequestOptions,
): Promise<WeatherReading> {
  const preferred = coords ? nearestHkoStation(coords) : null;
  return getJson('/weather', {}, (raw) => parseWeather(raw, preferred?.name ?? null), options);
}