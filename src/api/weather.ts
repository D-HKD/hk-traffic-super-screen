import { isRecord, numberOrNull, optionalText, record, text } from '../lib/validate';
import { parseHkDateTime } from '../lib/format';
import { nearestHkoStation } from '../core/geo';
import type { RequestOptions } from './client';
import { getJson } from './client';
import type { WeatherReading } from './types';

const HKO_DEFAULT = '香港天文台';

function readings(payload: unknown, key: string): Record<string, unknown>[] {
  const root = record(payload, '天氣回應');
  const block = root[key];
  if (!isRecord(block)) return [];
  const data = block['data'];
  if (!Array.isArray(data)) return [];
  return data.filter(isRecord);
}

function pickByPlace(list: readonly Record<string, unknown>[], wanted: string | null): Record<string, unknown> | undefined {
  if (wanted) {
    const hit = list.find((row) => text(row['place'], 'place').includes(wanted));
    if (hit) return hit;
  }
  return list.find((row) => text(row['place'], 'place') === HKO_DEFAULT) ?? list[0];
}

/**
 * 解析 HKO rhrread。
 *
 * 舊版用 `Number(iconArray)` 猜天氣圖示，仲要自己維護一套 icon code 對照；
 * 這裡改為只講有官方定義的數字（溫度、濕度、雨量、紫外線），再加原本被忽略的
 * `warningMessage`（暴雨／颱風警告）——呢個才是真正要顯示給用戶的警報。
 */
export function parseWeather(payload: unknown, preferredStation: string | null): WeatherReading {
  const root = record(payload, '天氣回應');

  const temps = readings(payload, 'temperature');
  const hums = readings(payload, 'humidity');
  const rains = readings(payload, 'rainfall');
  const uvs = readings(payload, 'uvindex');

  const tempRow = pickByPlace(temps, preferredStation);
  const tempC = tempRow ? numberOrNull(tempRow['value']) : null;
  const station = tempRow ? text(tempRow['place'], 'place') || HKO_DEFAULT : HKO_DEFAULT;

  const humidity = (() => {
    const row = hums.find((r) => text(r['place'], 'place') === HKO_DEFAULT) ?? hums[0];
    return row ? numberOrNull(row['value']) : null;
  })();

  const rainMaxMm = rains.reduce<number | null>((max, row) => {
    const v = numberOrNull(row['max']);
    if (v === null) return max;
    return max === null || v > max ? v : max;
  }, null);

  const uvRow = uvs[0];
  const uvDesc = uvRow ? text(uvRow['desc'], 'desc') || null : null;

  const warning = optionalText(root['warningMessage'], 'warningMessage') ?? null;
  const tip = optionalText(root['tcmessage'], 'tcmessage') ?? null;
  const observedRaw = optionalText(root['updateTime'], 'updateTime');

  return {
    station,
    tempC,
    humidity,
    rainMaxMm,
    uvDesc,
    warning: warning ?? tip,
    observedAt: observedRaw ? parseHkDateTime(observedRaw) : null,
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
