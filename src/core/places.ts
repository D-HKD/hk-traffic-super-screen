import { LRT_GROUPS } from '../config.ts';

/**
 * 地理／車站輔助。實際資料（站名、座標、附近巴士站）全部在 `src/config.ts`，
 * 呢個檔案只負責計算，所以可以獨立做單元測試。
 */

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

const EARTH_RADIUS_KM = 6371;

/** 球面直線距離（公里）。 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LrtStation {
  readonly code: string;
  readonly name: string;
  readonly area: string;
  readonly lat: number;
  readonly lon: number;
}

export const LRT_STATIONS: readonly LrtStation[] = LRT_GROUPS.map((group) => ({
  code: group.station,
  name: group.name,
  area: group.area,
  lat: group.lat,
  lon: group.lon,
}));

export interface BusStopRef {
  readonly id: string;
  readonly name: string;
  readonly meters: number;
}

/** 以輕鐵站號索引的附近巴士站。 */
export const BUS_STOPS: Readonly<Record<string, readonly BusStopRef[]>> = Object.fromEntries(
  LRT_GROUPS.map((group) => [group.station, group.bus]),
);

export function lrtStations(): readonly LrtStation[] {
  return LRT_STATIONS;
}

export function stationName(code: string): string {
  return LRT_STATIONS.find((station) => station.code === code)?.name ?? code;
}

export function nearestLrtStation(point: GeoPoint): { station: LrtStation; km: number } {
  let best = { station: LRT_STATIONS[0] as LrtStation, km: Number.POSITIVE_INFINITY };
  for (const station of LRT_STATIONS) {
    const km = haversineKm(point, station);
    if (km < best.km) best = { station, km };
  }
  return best;
}

export function busStopsFor(code: string): readonly BusStopRef[] {
  return BUS_STOPS[code] ?? [];
}
