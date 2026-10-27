import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySeverity,
  classifyState,
  isReopened,
  isRelevantToDistrict,
  roadStatuses,
  sortByNewest,
} from '../src/core/messages.ts';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'x',
    heading: '交通消息',
    detail: '',
    content: '',
    location: '',
    direction: '',
    status: '新增',
    announcedAt: new Date('2026-10-27T10:00:00+08:00'),
    severity: 'notice',
    msgState: 'new',
    ...overrides,
  };
}

test('封閉類消息判為 closure', () => {
  assert.equal(classifySeverity('道路事故', '交通意外', '屯門公路全線封閉'), 'closure');
});

test('普通意外判為 incident', () => {
  assert.equal(classifySeverity('道路事故', '交通意外', '葵涌道有交通意外，部分行車線受阻'), 'incident');
});

test('「現已解封」唔會被當成封閉（舊版會誤報）', () => {
  const content = '較早前因交通意外而封閉的屯門公路（往九龍方向）現已解封。';
  assert.equal(isReopened(content), true);
  assert.equal(classifySeverity('道路事故', '交通意外', content), 'notice');
  assert.equal(classifyState('更新情況', content), 'reopened');
});

test('狀態文字對應', () => {
  assert.equal(classifyState('新增', '有交通意外'), 'new');
  assert.equal(classifyState('UPDATED', '交通意外'), 'updated');
  assert.equal(classifyState('其他', '普通消息'), 'other');
});

test('屯門公路計入，但屯門碼頭唔會計入屯門公路', () => {
  const items = [
    item({ id: 'a', content: '屯門公路近屯門閣有交通意外' }),
    item({ id: 'b', content: '屯門碼頭附近有工程' }),
  ];
  const statuses = roadStatuses(items as never);
  const tuenMun = statuses.find((status) => status.road.id === 'tuenmun');
  assert.ok(tuenMun);
  assert.equal(tuenMun.count, 1);
});

test('冇相關消息時 count 為 0（唔會假裝暢順）', () => {
  const statuses = roadStatuses([item({ content: '沙田大埔公路有事故' })] as never);
  for (const status of statuses) assert.equal(status.count, 0);
});

test('地區相關性', () => {
  assert.equal(isRelevantToDistrict(item({ location: '屯門碼頭' }) as never), true);
  assert.equal(isRelevantToDistrict(item({ location: '沙田市中心' }) as never), false);
});

test('按時間新到舊排序', () => {
  const older = item({ id: 'old', announcedAt: new Date('2026-10-27T08:00:00+08:00') });
  const newer = item({ id: 'new', announcedAt: new Date('2026-10-27T10:00:00+08:00') });
  assert.deepEqual(
    sortByNewest([older, newer] as never).map((entry) => entry.id),
    ['new', 'old'],
  );
});
