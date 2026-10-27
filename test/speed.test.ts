import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROAD_LIMITS, congestionBand, ratioPercent, slowestDirection, speedRatio } from '../src/core/speed.ts';

test('比例分級：≥85% 暢順、60-85% 緩慢、<60% 擠塞', () => {
  assert.equal(congestionBand(0.9), 'smooth');
  assert.equal(congestionBand(0.85), 'smooth');
  assert.equal(congestionBand(0.84), 'slow');
  assert.equal(congestionBand(0.6), 'slow');
  assert.equal(congestionBand(0.59), 'jam');
});

test('冇數據或冇限速 → unknown，唔會當成擠塞', () => {
  assert.equal(congestionBand(null), 'unknown');
  assert.equal(speedRatio(null, 70), null);
  assert.equal(speedRatio(50, undefined), null);
  assert.equal(speedRatio(50, 0), null);
});

test('同一車速在不同限速下可以有不同結論', () => {
  // 60 km/h：在 70 限速 = 86% 暢順；在 100 限速 = 60% 邊緣緩慢
  assert.equal(congestionBand(speedRatio(60, 70)), 'smooth');
  assert.equal(congestionBand(speedRatio(60, 100)), 'slow');
});

test('四條路都有合理限速，且符合香港常見值', () => {
  for (const [id, limit] of Object.entries(ROAD_LIMITS)) {
    assert.ok(limit >= 30 && limit <= 110, `${id} 限速不合理：${limit}`);
    assert.equal(limit % 10, 0, `${id} 限速應為 10 的倍數`);
  }
});

test('百分比顯示', () => {
  assert.equal(ratioPercent(0.855), '86%');
  assert.equal(ratioPercent(1.2), '120%');
  assert.equal(ratioPercent(null), '--');
});

test('方向差異：相差超過 20% 才標示「較慢」', () => {
  assert.equal(slowestDirection([{ dir: '東行', kmh: 80 }, { dir: '西行', kmh: 70 }]), null, '70/80=87.5%，未夠明顯');
  const slow = slowestDirection([{ dir: '東行', kmh: 80 }, { dir: '西行', kmh: 40 }]);
  assert.equal(slow?.dir, '西行');
  assert.equal(slow?.kmh, 40);
  assert.equal(slowestDirection([{ dir: '東行', kmh: 80 }]), null, '單一方向唔標示');
  assert.equal(slowestDirection([]), null);
});
