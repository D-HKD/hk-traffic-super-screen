import type { BusArrival, Slice } from '../api/types';
import { groupByStop } from '../core/bus';
import { busStopsFor } from '../core/places';
import { walkLabel, walkMinutes } from '../core/walk';
import { byId, h, replace, setText } from '../lib/dom';
import { agoText, etaText, freshness } from '../lib/format';

const STALE_MS = 3 * 60_000;
const DEAD_MS = 20 * 60_000;
const PER_STOP = 2;

function badgeText(slice: Slice<readonly BusArrival[]>, now: Date): string {
  if (slice.state === 'error') return '更新失敗';
  if (!slice.updatedAt) return '載入中';
  const level = freshness(slice.updatedAt, now, STALE_MS, DEAD_MS);
  if (level === 'dead') return `過時（${agoText(slice.updatedAt, now)}）`;
  if (level === 'stale') return `延遲（${agoText(slice.updatedAt, now)}）`;
  return `已同步 ${agoText(slice.updatedAt, now)}`;
}

/** 九巴路線號有字母（A37／E37C／259D），所以獨立一個 chip 樣式，唔跟輕鐵色相。 */
function busRow(row: BusArrival): HTMLElement {
  const eta = etaText(row.minutes);
  return h(
    'div',
    { class: 'bus-row' },
    h('span', { class: 'bus-chip', text: row.route }),
    h('div', { class: 'bus-info' }, h('b', { text: row.dest ? `往${row.dest}` : '目的地不詳' })),
    h(
      'strong',
      { class: eta.due ? 'due' : undefined },
      h('span', { class: eta.due ? 'eta-value eta-soon' : 'eta-value', text: eta.value }),
      eta.unit ? h('em', { text: eta.unit }) : null,
    ),
  );
}

export function renderBus(
  slice: Slice<readonly BusArrival[]>,
  stationCode: string,
  stationName: string,
  now: Date,
): void {
  setText(byId('bus-badge'), badgeText(slice, now));

  const stops = busStopsFor(stationCode);
  if (stops.length === 0) {
    setText(byId('bus-stops'), '未設定附近巴士站');
  } else {
    const longest = Math.max(...stops.map((stop) => walkMinutes(stop.meters)));
    setText(
      byId('bus-stops'),
      `${stationName}站附近 ${stops.length} 個巴士站・步行 1-${longest} 分鐘（直線估算）`,
    );
  }

  const list = byId('bus-list');
  if (!slice.data) {
    if (slice.state === 'error') {
      replace(list, h('div', { class: 'state-error', text: slice.error ?? '暫時取不到九巴到站資料' }));
    } else {
      replace(list, h('span', { class: 'skeleton', aria: { hidden: 'true' } }));
    }
    return;
  }

  const groups = groupByStop(slice.data, stops, PER_STOP);
  if (groups.length === 0) {
    replace(list, h('div', { class: 'state-empty', text: '附近巴士站暫無即將到站班次' }));
    return;
  }

  replace(
    list,
    ...groups.map((group) =>
      h(
        'section',
        { class: 'bus-group' },
        h(
          'div',
          { class: 'bus-group-head' },
          h('b', { text: group.stop.name }),
          h('span', { title: `直線距離約 ${group.stop.meters} 米`, text: walkLabel(group.stop.meters) }),
        ),
        ...group.rows.map(busRow),
      ),
    ),
  );
}