import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groupByStop } from '../src/core/bus.ts';

const stops = [
  { id: 'A', name: '站甲 TA001', meters: 120 },
  { id: 'B', name: '站乙 TA002', meters: 200 },
  { id: 'C', name: '站丙 TA003', meters: 260 },
];

const rows = [
  { route: '69M', dest: '天水圍', minutes: 3, stopId: 'A' },
  { route: 'E37', dest: '機場', minutes: 12, stopId: 'A' },
  { route: '265B', dest: '旺角', minutes: 9, stopId: 'A' },
  { route: '269D', dest: '沙田', minutes: 4, stopId: 'B' },
];

test('按上車站分組，每組最多 2 班、按時間排序', () => {
  const groups = groupByStop(rows, stops);
  assert.equal(groups.length, 2, '冇班次的站不應出現');
  assert.equal(groups[0]?.stop.id, 'A');
  assert.deepEqual(groups[0]?.rows.map((r) => r.route), ['69M', '265B'], '第三班 12 分鐘應被截走');
  assert.deepEqual(groups[1]?.rows.map((r) => r.route), ['269D']);
});

test('perStop 可調，且唔會漏站', () => {
  const groups = groupByStop(rows, stops, 5);
  assert.equal(groups[0]?.rows.length, 3);
  assert.equal(groups.length, 2, '站丙仍然冇班次');
});

test('完全冇班次時回空陣列，唔會出現空組', () => {
  assert.deepEqual(groupByStop([], stops), []);
});
