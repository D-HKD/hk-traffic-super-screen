import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agoText, distanceText, etaText, freshness, parseHkDateTime } from '../src/lib/format.ts';

test('到站分鐘：0 或 1 分鐘顯示「即將」', () => {
  assert.equal(etaText(0).value, '即將');
  assert.equal(etaText(1).value, '即將');
  assert.equal(etaText(5).value, '5');
  assert.equal(etaText(5).unit, '分鐘');
  assert.equal(etaText(null).value, '--');
});

test('相對時間', () => {
  const now = new Date('2026-10-27T10:30:00+08:00');
  assert.equal(agoText(new Date('2026-10-27T10:29:58+08:00'), now), '剛剛');
  assert.equal(agoText(new Date('2026-10-27T10:29:00+08:00'), now), '1 分鐘前');
  assert.equal(agoText(new Date('2026-10-27T09:30:00+08:00'), now), '1 小時前');
  assert.equal(agoText(null, now), '未有資料');
});

test('新鮮度三段', () => {
  const now = new Date('2026-10-27T10:30:00+08:00');
  assert.equal(freshness(new Date('2026-10-27T10:29:50+08:00'), now, 45_000, 300_000), 'ok');
  assert.equal(freshness(new Date('2026-10-27T10:28:00+08:00'), now, 45_000, 300_000), 'stale');
  assert.equal(freshness(new Date('2026-10-27T10:00:00+08:00'), now, 45_000, 300_000), 'dead');
  assert.equal(freshness(null, now, 45_000, 300_000), 'dead');
});

test('解析運輸署無時區時間', () => {
  const date = parseHkDateTime('2026-10-27T10:23:00');
  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 9);
  assert.equal(date.getDate(), 27);
  assert.equal(date.getHours(), 10);
  assert.equal(date.getMinutes(), 23);
});

test('錯誤時間字串回 null', () => {
  assert.equal(parseHkDateTime(''), null);
  assert.equal(parseHkDateTime('not a date'), null);
});

test('距離文字', () => {
  assert.equal(distanceText(0.42), '420 米');
  assert.equal(distanceText(3.34), '3.3 公里');
});
