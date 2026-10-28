import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseStopEta } from '../src/api/bus.ts';
import { parseLrtSchedule } from '../src/api/lrt.ts';
import { parseTmlSchedule } from '../src/api/mtr.ts';
import { LRT_GROUPS } from '../src/config.ts';

// 共通原則：外部 API 一行壞，唔應該令整個面板消失。

const now = new Date('2026-10-28T10:00:00+08:00');

test('九巴：一班格式壞掉，其餘班次照樣顯示', () => {
  const payload = {
    data: [
      { route: '69M', eta: '2026-10-28T10:03:00+08:00', dest_tc: '天水圍市中心', eta_seq: 1, co: 'KMB' },
      { route: { bad: true }, eta: '2026-10-28T10:05:00+08:00', dest_tc: '壞資料', eta_seq: 1, co: 'KMB' },
      { route: '269D', eta: '2026-10-28T10:09:00+08:00', dest_tc: '沙田', eta_seq: 1, co: 'KMB' },
    ],
  };
  const rows = parseStopEta(payload, { id: 'AAAAAAAABBBBBBBB', name: '測試站' }, now);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.route), ['69M', '269D']);
});

test('九巴：整個 payload 唔似資料時會拋錯（寧願顯示「更新失敗」，唔假裝冇班次）', () => {
  for (const bad of [null, 'oops', 42]) {
    assert.throws(() => parseStopEta(bad, { id: 'AAAAAAAABBBBBBBB', name: '測試站' }, now));
  }
});

test('輕鐵：一班壞掉，其餘照樣顯示（單卡／雙卡照計）', () => {
  const group = LRT_GROUPS.find((g) => g.station === '500') ?? LRT_GROUPS[0];
  const payload = {
    platform_list: [
      {
        platform_id: '1',
        route_list: [
          { route_no: '705', dest_ch: '天水圍循環線', time_ch: '3', train_length: 2 },
          { route_no: { bad: true }, dest_ch: '壞', time_ch: '5', train_length: 1 },
          { route_no: '706', dest_ch: '天水圍循環線', time_ch: '7', train_length: 1 },
        ],
      },
    ],
  };
  const rows = parseLrtSchedule(payload, group);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.route), ['705', '706']);
  assert.equal(rows[0]?.cars, 2);
  assert.equal(rows[1]?.cars, 1);
});

test('輕鐵：platform_list 缺失時回空陣列', () => {
  const group = LRT_GROUPS[0];
  assert.deepEqual(parseLrtSchedule({}, group), []);
  assert.deepEqual(parseLrtSchedule(null, group), []);
});

test('屯馬綫：一班壞掉，其餘方向照樣顯示', () => {
  const payload = {
    data: {
      'TML-TIS': {
        curr_time: '2026-10-28 10:00:00',
        UP: [
          { dest: 'TUM', plat: '1', ttnt: '3', valid: 'Y' },
          { dest: { bad: true }, plat: '1', ttnt: '6', valid: 'Y' },
        ],
        DOWN: [{ dest: 'WKS', plat: '2', ttnt: '5', valid: 'Y' }],
      },
    },
  };
  const station = parseTmlSchedule(payload, 'TIS');
  assert.equal(station.up.length, 1);
  assert.equal(station.down.length, 1);
  assert.equal(station.up[0]?.minutes, 3);
  assert.equal(station.down[0]?.minutes, 5);
});

test('屯馬綫：終點站只有單方向都唔會拋錯', () => {
  const payload = { data: { 'TML-TUM': { curr_time: '2026-10-28 10:00:00', DOWN: [{ dest: 'TIS', plat: '1', ttnt: '4', valid: 'Y' }] } } };
  const station = parseTmlSchedule(payload, 'TUM');
  assert.equal(station.up.length, 0);
  assert.equal(station.down.length, 1);
});