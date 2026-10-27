import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LRT_STATIONS, busStopsFor, nearestLrtStation } from '../src/core/places.ts';

const TIN_SHUI_WAI = { lat: 22.4585, lon: 114.0005 };
const TUEN_MUN_TOWN = { lat: 22.3945, lon: 113.9725 };
const TUEN_MUN_FERRY = { lat: 22.3725, lon: 113.9665 };

test('GPS 自動選站：天水圍一帶 → 天榮', () => {
  const nearest = nearestLrtStation(TIN_SHUI_WAI);
  assert.equal(nearest.station.name, '天榮');
  assert.ok(nearest.km < 0.5, `距離應少於 500 米，實際 ${nearest.km.toFixed(2)} km`);
});

test('GPS 自動選站：屯門市中心 → 屯門', () => {
  const nearest = nearestLrtStation(TUEN_MUN_TOWN);
  assert.equal(nearest.station.name, '屯門');
  assert.ok(nearest.km < 0.5);
});

test('GPS 自動選站：屯門碼頭 → 兆禧', () => {
  const nearest = nearestLrtStation(TUEN_MUN_FERRY);
  assert.equal(nearest.station.name, '兆禧');
  assert.ok(nearest.km < 0.6);
});

test('三個站座標互不相同（避免複製貼上錯誤）', () => {
  const keys = new Set(LRT_STATIONS.map((station) => `${station.lat},${station.lon}`));
  assert.equal(keys.size, LRT_STATIONS.length);
});

test('每個站都有 1-3 個附近巴士站，且站 ID 符合九巴格式', () => {
  for (const station of LRT_STATIONS) {
    const stops = busStopsFor(station.code);
    assert.ok(stops.length >= 1 && stops.length <= 3, `${station.name} 巴士站數量異常`);
    for (const stop of stops) {
      assert.match(stop.id, /^[0-9A-F]{16}$/, `${stop.name} 的站 ID 格式不對`);
      assert.ok(stop.meters > 0 && stop.meters < 500, `${stop.name} 距離應在 500 米內`);
    }
  }
});
