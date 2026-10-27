import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeAdvice, type AdviceInput } from '../src/core/advice.ts';

function input(overrides: Partial<AdviceInput> = {}): AdviceInput {
  return {
    worstSeverity: null,
    activeCount: 0,
    reopenedCount: 0,
    tempC: 24,
    warning: null,
    railFailed: false,
    nextTrainMinutes: 4,
    ...overrides,
  };
}

test('有未解封封閉 → bad', () => {
  const advice = computeAdvice(input({ worstSeverity: 'closure', activeCount: 1 }));
  assert.equal(advice.level, 'bad');
  assert.ok(advice.reasons.length > 0);
});

test('有事故 → warn', () => {
  const advice = computeAdvice(input({ worstSeverity: 'incident', activeCount: 2 }));
  assert.equal(advice.level, 'warn');
});

test('只有已解封消息 → good（唔會誤報）', () => {
  const advice = computeAdvice(input({ worstSeverity: null, activeCount: 0, reopenedCount: 2 }));
  assert.equal(advice.level, 'good');
});

test('天氣警告 → warn，即使冇交通消息', () => {
  const advice = computeAdvice(input({ warning: '雷暴警告' }));
  assert.equal(advice.level, 'warn');
  assert.match(advice.text + advice.reasons.join(''), /雷暴/);
});

test('高溫 → warn', () => {
  const advice = computeAdvice(input({ tempC: 34 }));
  assert.equal(advice.level, 'warn');
});

test('鐵路失敗但其他正常 → warn，並且講明原因', () => {
  const advice = computeAdvice(input({ railFailed: true }));
  assert.equal(advice.level, 'warn');
  assert.ok(advice.reasons.some((reason) => reason.includes('鐵路')));
});

test('全部正常 → good', () => {
  const advice = computeAdvice(input());
  assert.equal(advice.level, 'good');
});
