import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WALK_METERS_PER_MINUTE, walkLabel, walkMinutes } from '../src/core/walk.ts';

test('步行時間：80 米 ≈ 1 分鐘', () => {
  assert.equal(WALK_METERS_PER_MINUTE, 80);
  assert.equal(walkMinutes(80), 1);
  assert.equal(walkMinutes(168), 2);
  assert.equal(walkMinutes(400), 5);
});

test('極短距離至少顯示 1 分鐘，唔會變 0', () => {
  assert.equal(walkMinutes(40), 1);
  assert.equal(walkMinutes(1), 1);
});

test('冇距離時回 0 / —，唔會亂顯示', () => {
  assert.equal(walkMinutes(0), 0);
  assert.equal(walkMinutes(Number.NaN), 0);
  assert.equal(walkLabel(0), '—');
  assert.equal(walkLabel(168), '步行約 2 分鐘');
});
