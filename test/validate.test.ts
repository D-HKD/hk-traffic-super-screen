import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ShapeError, array, isRecord, minutesFrom, number, numberOrNull, record, text } from '../src/lib/validate.ts';

test('record 拒絕陣列與 null', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.throws(() => record([], 'data'), ShapeError);
  assert.throws(() => record(null, 'data'), ShapeError);
});

test('錯誤訊息包含路徑，方便定位', () => {
  try {
    record([], '回應.data');
    assert.fail('應該拋錯');
  } catch (error) {
    assert.ok(error instanceof ShapeError);
    assert.match((error as Error).message, /回應\.data/);
  }
});

test('array 拒絕物件', () => {
  assert.throws(() => array({}, 'items'), ShapeError);
  assert.deepEqual(array([1, 2], 'items'), [1, 2]);
});

test('text 會 trim 並拒絕奇怪型別', () => {
  assert.equal(text('  abc  ', 'x'), 'abc');
  assert.equal(text(undefined, 'x'), '');
  assert.throws(() => text({}, 'x'), ShapeError);
});

test('number 與 numberOrNull', () => {
  assert.equal(number('27', 'temp'), 27);
  assert.equal(numberOrNull('27°C'), 27);
  assert.equal(numberOrNull('abc'), null);
  assert.throws(() => number('abc', 'temp'), ShapeError);
});

test('minutesFrom 對 MTR 的 ttnt 字串有效', () => {
  assert.equal(minutesFrom('0'), 0);
  assert.equal(minutesFrom('13'), 13);
  assert.equal(minutesFrom(''), null);
});
