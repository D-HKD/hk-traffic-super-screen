import { test } from 'node:test';
import assert from 'node:assert/strict';

import { textOrJoined } from '../src/core/hko.ts';

// 2026-10-28 真實事故：HKO 有警告生效時，warningMessage 由字串變成陣列，
// 舊版解析器拋錯 → 整個天氣面板顯示「天氣更新失敗」，連溫度都冇。

test('字串：原樣返回', () => {
  assert.equal(textOrJoined('強烈季候風信號現正生效。'), '強烈季候風信號現正生效。');
});

test('陣列：用換行連接（HKO 實際格式）', () => {
  assert.equal(textOrJoined(['強烈季候風信號現正生效。']), '強烈季候風信號現正生效。');
  assert.equal(textOrJoined(['暴雨警告信號', '雷暴警告']), '暴雨警告信號\n雷暴警告');
});

test('陣列內有非字串或空白：過濾後連接', () => {
  assert.equal(textOrJoined(['暴雨警告信號', null, 42, '  ', '雷暴警告']), '暴雨警告信號\n雷暴警告');
});

test('空值一律當作「冇警告」而唔係拋錯', () => {
  assert.equal(textOrJoined(undefined), null);
  assert.equal(textOrJoined(null), null);
  assert.equal(textOrJoined(''), null);
  assert.equal(textOrJoined('   '), null);
  assert.equal(textOrJoined([]), null);
  assert.equal(textOrJoined(['', ' ']), null);
  assert.equal(textOrJoined({ weird: true }), null);
  assert.equal(textOrJoined(123), null);
});