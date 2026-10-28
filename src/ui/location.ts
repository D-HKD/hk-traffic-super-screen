import type { GpsState } from '../api/types.ts';
import { nearestHkoStation, nearestTmlStation } from '../core/geo.ts';
import { byId, setText } from '../lib/dom.ts';
import { clockText, distanceText } from '../lib/format.ts';

const STATUS_TEXT: Readonly<Record<GpsState['status'], string>> = {
  idle: '未啟用',
  locating: '定位中…',
  ok: '已定位',
  cached: '上次定位',
  denied: '未授權定位',
  unsupported: '此裝置不支援定位',
};

export function renderLocation(gps: GpsState): void {
  setText(byId('loc-status'), STATUS_TEXT[gps.status]);

  if (gps.lat === null || gps.lon === null) {
    setText(byId('gps-place'), STATUS_TEXT[gps.status]);
    setText(
      byId('gps-detail'),
      gps.status === 'denied'
        ? '瀏覽器封鎖了定位；可在網站設定重新允許'
        : '按下方「用我位置」或右上角 ⌖ 定位一次',
    );
    setText(byId('loc-station'), '--');
    setText(byId('loc-distance'), '--');
    setText(byId('loc-weather'), '--');
    byId('loc-note').textContent = '距離為直線距離，並非步行或行車路線。';
    return;
  }

  const point = { lat: gps.lat, lon: gps.lon };
  const station = nearestTmlStation(point);
  const hko = nearestHkoStation(point);

  setText(byId('gps-place'), `${station.name}附近`);
  const accuracy = gps.accuracyM !== null ? ` ±${Math.round(gps.accuracyM)} 米` : '';
  const when = gps.at ? ` · ${clockText(gps.at)}` : '';
  setText(byId('gps-detail'), `${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}${accuracy}${when}`);
  setText(byId('loc-station'), `${station.name}（${station.code}）`);
  setText(byId('loc-distance'), distanceText(station.km));
  setText(byId('loc-weather'), hko.name);
  byId('loc-note').textContent = `距離為直線距離（${distanceText(station.km)}），並非步行或行車路線；天氣用最近觀測站 ${hko.name}。`;
}

export type MapApp = 'google' | 'amap';

export const MAP_APP_LABEL: Readonly<Record<MapApp, string>> = {
  google: 'Google 地圖',
  amap: '高德地圖',
};

/**
 * 開地圖。
 *
 * 高德用 uri.amap.com 的通用連結：已安裝 App 會直接開 App，未安裝就開網頁版。
 * coordinate=wgs84 一定要帶——GPS 係 WGS84，而高德預設當 GCJ-02，
 * 唔寫嘅話支針會偏移（香港雖然多數無偏移，但帶住最安全）。
 */
export function mapsUrl(gps: GpsState, app: MapApp = 'google', label = ''): string {
  const hasFix = gps.lat !== null && gps.lon !== null;
  if (app === 'amap') {
    if (!hasFix) return 'https://uri.amap.com/marker?position=114.1694,22.3193&name=%E9%A6%99%E6%B8%AF&coordinate=wgs84&callnative=1';
    const name = encodeURIComponent(label || '我的位置');
    return `https://uri.amap.com/marker?position=${gps.lon.toFixed(6)},${gps.lat.toFixed(6)}&name=${name}&coordinate=wgs84&callnative=1`;
  }
  if (hasFix) return `https://www.google.com/maps/search/?api=1&query=${gps.lat.toFixed(5)},${gps.lon.toFixed(5)}`;
  return 'https://www.google.com/maps/search/?api=1&query=%E9%A6%99%E6%B8%AF';
}

export function searchUrl(query: string, gps: GpsState): string {
  const base = 'https://www.google.com/maps/search/?api=1&query=';
  const center = gps.lat !== null && gps.lon !== null ? `&center=${gps.lat.toFixed(5)},${gps.lon.toFixed(5)}` : '';
  return base + encodeURIComponent(query) + center;
}
