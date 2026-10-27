import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROAD_DEFS, aggregateSpeeds, parseDetectorInfoCsv, parseRawSpeedXml } from '../worker/src/roads.js';

const CSV = [
  'AID_ID_Number,District,Road_EN,Road_TC,Road_SC,Easting,Northing,Latitude,Longitude,Direction,Rotation',
  'AID05201,Tuen Mun,Tuen Mun Road near Belvedere Garden,屯門公路近麗城花園一期停車場 - 東行,屯門公路近丽城花园,833758,812147,22.248091,114.152525,East,100',
  'AID09208,Tuen Mun,Tuen Mun Road near Chai Wan Kok,屯門公路近柴灣角熟食市場 - 西行,屯門公路近柴湾角,833758,812147,22.248091,114.152525,South West,100',
  'AID03124,Yuen Long,Tsing Long Highway near Castle Peak Road,青朗公路近青山公路元朗段 - 北行 (1),青朗公路,833758,812147,22.248091,114.152525,North West,100',
  'TDSCPRHSK10001,Tuen Mun,CPR Lam Tei,青山公路藍地段近藍地寵物公園 - 北行,青山公路,833758,812147,22.248091,114.152525,North East,100',
].join('\n');

const XML = `<?xml version="1.0" encoding="utf-8"?>
<raw_speed_volume_list><date>2026-10-27</date><periods><period>
<period_from>11:23:00</period_from><period_to>11:23:30</period_to>
<detectors>
<detector><detector_id>AID05201</detector_id><direction>East</direction><lanes>
<lane><lane_id>Fast Lane</lane_id><speed>92</speed><valid>Y</valid></lane>
<lane><lane_id>Middle Lane</lane_id><speed>80</speed><valid>Y</valid></lane>
<lane><lane_id>Slow Lane</lane_id><speed>20</speed><valid>N</valid></lane>
</lanes></detector>
<detector><detector_id>AID09208</detector_id><direction>South West</direction><lanes>
<lane><lane_id>Fast Lane</lane_id><speed>60</speed><valid>Y</valid></lane>
<lane><lane_id>Middle Lane</lane_id><speed>40</speed><valid>Y</valid></lane>
</lanes></detector>
<detector><detector_id>TDSCPRHSK10001</detector_id><direction>North East</direction><lanes>
<lane><lane_id>Fast Lane</lane_id><speed>45</speed><valid>Y</valid></lane>
</lanes></detector>
</detectors></period></periods></raw_speed_volume_list>`;

test('CSV 解析：路名在位置描述內，並取出方向', () => {
  const map = parseDetectorInfoCsv(CSV);
  assert.equal(map.size, 4);
  assert.match(map.get('AID05201').location, /^屯門公路/);
  assert.equal(map.get('AID05201').direction, '東行');
  assert.equal(map.get('AID09208').direction, '西行');
  assert.equal(map.get('AID03124').direction, '北行');
});

test('XML 解析：只取 valid=Y 的車道', () => {
  const { period, speeds } = parseRawSpeedXml(XML);
  assert.equal(period, '11:23:30');
  assert.deepEqual(speeds.get('AID05201'), [92, 80], 'Slow Lane valid=N 應被排除');
  assert.deepEqual(speeds.get('AID09208'), [60, 40]);
});

test('聚合：先計探測器平均，再平均探測器', () => {
  const info = parseDetectorInfoCsv(CSV);
  const { speeds } = parseRawSpeedXml(XML);
  const result = aggregateSpeeds(ROAD_DEFS, info, speeds);

  assert.equal(result.tuenmun.detectors, 2);
  assert.ok(Math.abs(result.tuenmun.kmh - 68) < 0.05, `實際 ${result.tuenmun.kmh}`);

  assert.equal(result.castle.detectors, 1);
  assert.ok(Math.abs(result.castle.kmh - 45) < 0.05);

  assert.equal(result.yuenlong.detectors, 0);
  assert.equal(result.yuenlong.kmh, null);
});

test('方向分開：東行 86、西行 50，唔會被平均成 68 而睇唔出東行塞', () => {
  const info = parseDetectorInfoCsv(CSV);
  const { speeds } = parseRawSpeedXml(XML);
  const result = aggregateSpeeds(ROAD_DEFS, info, speeds);

  assert.equal(result.tuenmun.dirs.length, 2);
  const east = result.tuenmun.dirs.find((d) => d.dir === '東行');
  const west = result.tuenmun.dirs.find((d) => d.dir === '西行');
  assert.ok(east && west);
  assert.equal(east.kmh, 86);
  assert.equal(west.kmh, 50);
  assert.equal(east.detectors, 1);
  // 最慢方向排第一
  assert.equal(result.tuenmun.dirs[0].dir, '西行');
});

test('青朗公路唔會被當成元朗公路', () => {
  const info = parseDetectorInfoCsv(CSV);
  const { speeds } = parseRawSpeedXml(XML);
  const result = aggregateSpeeds(ROAD_DEFS, info, speeds);
  assert.equal(result.yuenlong.detectors, 0);
});
