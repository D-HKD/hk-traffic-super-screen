import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LRT_STATIONS, busStopsFor, nearestLrtStation } from '../src/core/places.ts';

test('全部 68 個輕鐵站都在（屯門／天水圍／元朗）', () => {
  assert.equal(LRT_STATIONS.length, 68);
  const areas = new Set(LRT_STATIONS.map((station) => station.area));
  assert.deepEqual([...areas].sort(), ['元朗', '天水圍', '屯門'].sort());
});

test('GPS 自動選站：屯門市中心 → 屯門', () => {
  const nearest = nearestLrtStation({ lat: 22.3945, lon: 113.9725 });
  assert.equal(nearest.station.name, '屯門');
  assert.ok(nearest.km < 0.2, `實際 ${nearest.km.toFixed(2)} km`);
});

test('GPS 自動選站：屯門碼頭 → 屯門碼頭站（全網最近，不再只有 3 站）', () => {
  const nearest = nearestLrtStation({ lat: 22.3725, lon: 113.9665 });
  assert.equal(nearest.station.name, '屯門碼頭');
  assert.ok(nearest.km < 0.1);
});

test('GPS 自動選站：元朗 → 元朗站', () => {
  const nearest = nearestLrtStation({ lat: 22.445, lon: 114.034 });
  assert.equal(nearest.station.name, '元朗');
  assert.ok(nearest.km < 0.2);
});

test('GPS 自動選站：兆康 → 兆康站', () => {
  const nearest = nearestLrtStation({ lat: 22.412, lon: 113.978 });
  assert.equal(nearest.station.name, '兆康');
  assert.ok(nearest.km < 0.1);
});

test('GPS 自動選站：天水圍一帶會選到區內最近站（唔再由硬編 3 站決定）', () => {
  const nearest = nearestLrtStation({ lat: 22.4585, lon: 114.0005 });
  assert.equal(nearest.station.area, '天水圍');
  assert.ok(nearest.km < 0.3, `實際 ${nearest.km.toFixed(2)} km`);
});

test('站號與座標都不重複', () => {
  assert.equal(new Set(LRT_STATIONS.map((s) => s.code)).size, LRT_STATIONS.length);
  assert.equal(new Set(LRT_STATIONS.map((s) => `${s.lat},${s.lon}`)).size, LRT_STATIONS.length);
});

test('每站最多 2 個附近巴士站，站 ID 格式正確', () => {
  for (const station of LRT_STATIONS) {
    const stops = busStopsFor(station.code);
    assert.ok(stops.length <= 2, `${station.name} 有 ${stops.length} 個巴士站`);
    for (const stop of stops) {
      assert.match(stop.id, /^[0-9A-F]{16}$/, `${station.name} 的站 ID 格式不對`);
      assert.ok(stop.meters >= 0 && stop.meters <= 400, `${station.name} 距離異常`);
    }
  }
});