import { test } from 'node:test';
import assert from 'node:assert/strict';

import { textOrJoined } from '../src/core/hko.ts';
import { parseWeather } from '../src/api/weather.ts';

const base = {
  temperature: { data: [{ place: '香港天文台', value: 26, unit: 'C' }] },
  humidity: { data: [{ place: '香港天文台', value: 59, unit: 'percent' }] },
  rainfall: { data: [{ place: '中西區', max: 0, main: 'FALSE' }] },
  uvindex: { data: [{ desc: '低' }] },
  updateTime: '2026-10-28T09:02:00+08:00',
};

test('文字合併：字串、陣列、雜訊', () => {
  assert.equal(textOrJoined('強烈季候風信號現正生效。'), '強烈季候風信號現正生效。');
  assert.equal(textOrJoined(['暴雨警告信號', '雷暴警告']), '暴雨警告信號\n雷暴警告');
  assert.equal(textOrJoined(['暴雨', null, 42, '  ', '雷暴']), '暴雨\n雷暴');
  assert.equal(textOrJoined(undefined), null);
  assert.equal(textOrJoined([]), null);
  assert.equal(textOrJoined({ weird: true }), null);
});

test('完整資料：所有欄位正常，issues 為空', () => {
  const reading = parseWeather({ ...base, warningMessage: '強烈季候風信號現正生效。' }, null);
  assert.equal(reading.tempC, 26);
  assert.equal(reading.humidity, 59);
  assert.equal(reading.warning, '強烈季候風信號現正生效。');
  assert.deepEqual(reading.issues, []);
});

test('warningMessage 係陣列（HKO 有警告時的實際格式）→ 天氣照樣顯示', () => {
  const reading = parseWeather({ ...base, warningMessage: ['強烈季候風信號現正生效。'] }, null);
  assert.equal(reading.tempC, 26);
  assert.equal(reading.humidity, 59);
  assert.equal(reading.warning, '強烈季候風信號現正生效。');
  assert.deepEqual(reading.issues, []);
});

test('個別欄位型別爆掉：壞嗰個當冇，其餘照顯示，並記錄 issues', () => {
  const broken = {
    ...base,
    temperature: { data: [{ place: { bad: true }, value: 26 }] },
  };
  const reading = parseWeather(broken, null);
  assert.equal(reading.humidity, 59, '濕度唔應該因為溫度欄位壞咗而消失');
  assert.equal(reading.station, '香港天文台', '站名應回退到預設值');
  assert.ok(reading.issues.includes('temperature.place'), `實際 issues: ${reading.issues.join(',')}`);
});

test('updateTime 型別錯誤：時間為 null，但溫度濕度仍在', () => {
  const reading = parseWeather({ ...base, updateTime: ['bad'] }, null);
  assert.equal(reading.tempC, 26);
  assert.equal(reading.humidity, 59);
  assert.equal(reading.observedAt, null);
  assert.ok(reading.issues.includes('updateTime'), `實際 issues: ${reading.issues.join(',')}`);
});

test('缺少 temperature 區塊：溫度為 null，其餘仍可顯示', () => {
  const { temperature, ...withoutTemp } = base;
  const reading = parseWeather(withoutTemp, null);
  assert.equal(reading.tempC, null);
  assert.equal(reading.humidity, 59);
  assert.equal(reading.rainMaxMm, 0);
});

test('完全唔似資料（null／字串）：唔拋錯，全部 null', () => {
  for (const bad of [null, 'oops', 42, []]) {
    const reading = parseWeather(bad, null);
    assert.equal(reading.tempC, null);
    assert.equal(reading.warning, null);
  }
});

test('GPS 指定的觀測站會優先', () => {
  const payload = {
    ...base,
    temperature: {
      data: [
        { place: '香港天文台', value: 26 },
        { place: '屯門', value: 24 },
      ],
    },
  };
  const reading = parseWeather(payload, '屯門');
  assert.equal(reading.tempC, 24);
  assert.equal(reading.station, '屯門');
});