import type { GpsState } from '../api/types';
import { nearestHkoStation, nearestTmlStation } from '../core/geo';
import { byId, setText } from '../lib/dom';
import { clockText, distanceText } from '../lib/format';

const STATUS_TEXT: Readonly<Record<GpsState['status'], string>> = {
  idle: '未啟用',
  locating: '定位中…',
  ok: '已定位',
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
        : '按右上角 ⌖ 只用一次定位',
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

export function mapsUrl(gps: GpsState): string {
  if (gps.lat !== null && gps.lon !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${gps.lat.toFixed(5)},${gps.lon.toFixed(5)}`;
  }
  return 'https://www.google.com/maps/search/?api=1&query=%E9%A6%99%E6%B8%AF';
}

export function searchUrl(query: string, gps: GpsState): string {
  const base = 'https://www.google.com/maps/search/?api=1&query=';
  const center = gps.lat !== null && gps.lon !== null ? `&center=${gps.lat.toFixed(5)},${gps.lon.toFixed(5)}` : '';
  return base + encodeURIComponent(query) + center;
}
