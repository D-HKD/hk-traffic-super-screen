import { TML_STATIONS } from '../api/mtr.ts';
import { haversineKm, type GeoPoint } from './places.ts';

export type { GeoPoint };
export { haversineKm };

/** 香港天文台氣溫觀測站（近似座標，只用於挑選最近觀測站）。 */
export const HKO_STATIONS = [
  { name: '屯門', lat: 22.3919, lon: 113.9767 },
  { name: '元朗公園', lat: 22.4446, lon: 114.018 },
  { name: '流浮山', lat: 22.4678, lon: 113.984 },
  { name: '石崗', lat: 22.435, lon: 114.077 },
  { name: '大埔', lat: 22.4509, lon: 114.1656 },
  { name: '沙田', lat: 22.4029, lon: 114.21 },
  { name: '荃灣城門谷', lat: 22.3754, lon: 114.116 },
  { name: '荃灣可觀', lat: 22.394, lon: 114.098 },
  { name: '青衣', lat: 22.3448, lon: 114.1055 },
  { name: '深水埗', lat: 22.33, lon: 114.162 },
  { name: '九龍城', lat: 22.3282, lon: 114.1885 },
  { name: '觀塘', lat: 22.3115, lon: 114.225 },
  { name: '西貢', lat: 22.382, lon: 114.27 },
  { name: '將軍澳', lat: 22.315, lon: 114.263 },
  { name: '筲箕灣', lat: 22.278, lon: 114.226 },
  { name: '香港天文台', lat: 22.302, lon: 114.174 },
] as const;

export function nearestHkoStation(point: GeoPoint): { name: string; km: number } {
  let best: { name: string; km: number } = { name: HKO_STATIONS[0].name, km: Number.POSITIVE_INFINITY };
  for (const station of HKO_STATIONS) {
    const km = haversineKm(point, station);
    if (km < best.km) best = { name: station.name, km };
  }
  return best;
}

export function nearestTmlStation(point: GeoPoint): { code: string; name: string; km: number } {
  let best: { code: string; name: string; km: number } = {
    code: TML_STATIONS[0].code,
    name: TML_STATIONS[0].name,
    km: Number.POSITIVE_INFINITY,
  };
  for (const station of TML_STATIONS) {
    const km = haversineKm(point, station);
    if (km < best.km) best = { code: station.code, name: station.name, km };
  }
  return best;
}
