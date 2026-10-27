import type { AppState, PortArrival } from '../api/types';
import { loadBusStops } from '../api/bus';
import { groupByStop } from '../core/bus';
import { busStopsFor, stationName } from '../core/places';
import { walkLabel, walkMinutes } from '../core/walk';
import { byId, h, on, replace, setText } from '../lib/dom';
import { agoText, etaText, freshness } from '../lib/format';

const STALE_MS = 3 * 60_000;
const DEAD_MS = 20 * 60_000;
const PER_STOP = 2;

export interface BusHandlers {
  selectBusStop(id: string): void;
}

function badgeText(state: AppState['bus'], now: Date): string {
  if (state.state === 'error') return '更新失敗';
  if (!state.updatedAt) return '載入中';
  const level = freshness(state.updatedAt, now, STALE_MS, DEAD_MS);
  if (level === 'dead') return `過時（${agoText(state.updatedAt, now)}）`;
  if (level === 'stale') return `延遲（${agoText(state.updatedAt, now)}）`;
  return `已同步 ${agoText(state.updatedAt, now)}`;
}

/** 九巴路線號有字母（A37／E37C／259D），所以獨立一個 chip 樣式，唔跟輕鐵色相。 */
function busRow(row: { route: string; dest: string; minutes: number }): HTMLElement {
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

/**
 * 1015 個站不可能一次過塞入 <select>；第一次打開選單才下載（Worker 邊緣快取 6 小時）。
 */
export function initBusPicker(handlers: BusHandlers): void {
  const select = byId<HTMLSelectElement>('bus-stop');
  let loaded = false;

  const populate = async (): Promise<void> => {
    if (loaded) return;
    loaded = true;
    try {
      const list = await loadBusStops();
      for (const area of ['屯門', '天水圍', '元朗']) {
        const group = document.createElement('optgroup');
        group.label = area;
        for (const stop of list.filter((entry) => entry.area === area)) {
          const option = document.createElement('option');
          option.value = stop.id;
          option.textContent = stop.name;
          group.appendChild(option);
        }
        select.appendChild(group);
      }
      setText(byId('bus-count'), `${list.length} 個站`);
    } catch {
      loaded = false;
      setText(byId('bus-count'), '清單載入失敗');
    }
  };

  on(select, 'focus', () => void populate());
  on(select, 'pointerdown', () => void populate());
  on(select, 'change', () => handlers.selectBusStop(select.value));
}

function portRow(row: PortArrival): HTMLElement {
  const eta = etaText(row.minutes);
  return h(
    'div',
    { class: 'nlb-row' },
    h('span', { class: 'bus-chip nlb-chip', text: row.route }),
    h('div', { class: 'bus-info' }, h('b', { text: `${row.from} → ${row.dest}` })),
    h(
      'strong',
      { class: eta.due ? 'due' : undefined },
      h('span', { class: eta.due ? 'eta-value eta-soon' : 'eta-value', text: eta.value }),
      eta.unit ? h('em', { text: eta.unit }) : null,
    ),
  );
}

/** 口岸線（B2／B2P）——與九巴分開呈現，因為營運商同資料源都唔同。 */
export function renderPort(state: AppState): void {
  const block = document.getElementById('nlb-block');
  const list = byId('nlb-list');
  if (!block) return;

  if (!state.port.data) {
    if (state.port.state === 'error') {
      replace(list, h('div', { class: 'state-empty', text: state.port.error ?? '口岸線資料暫時取不到' }));
    } else {
      replace(list, h('span', { class: 'skeleton', aria: { hidden: 'true' } }));
    }
    return;
  }

  if (state.port.data.length === 0) {
    replace(list, h('div', { class: 'state-empty', text: '口岸線暫無即將開出班次' }));
    return;
  }
  replace(list, ...state.port.data.map(portRow));
}
export function renderBus(state: AppState, now: Date): void {
  setText(byId('bus-badge'), badgeText(state.bus, now));

  const select = document.getElementById('bus-stop') as HTMLSelectElement | null;
  if (select && select.value !== state.ui.busStop) select.value = state.ui.busStop;

  const chosen = state.ui.busStop;
  const auto = chosen === 'auto';

  let stops: readonly { id: string; name: string; meters: number }[] = [];
  if (auto) {
    stops = busStopsFor(state.ui.lrtStation);
    if (stops.length === 0) {
      setText(byId('bus-stops'), '未設定附近巴士站');
    } else {
      const longest = Math.max(...stops.map((stop) => walkMinutes(stop.meters)));
      setText(byId('bus-stops'), `${stationName(state.ui.lrtStation)}站附近 ${stops.length} 個巴士站・步行 1-${longest} 分鐘（直線估算）`);
    }
  } else {
    const label = select?.selectedOptions[0]?.textContent ?? chosen;
    stops = [{ id: chosen, name: label, meters: 0 }];
    setText(byId('bus-stops'), `${label}（指定站）`);
  }

  const list = byId('bus-list');
  if (!state.bus.data) {
    if (state.bus.state === 'error') {
      replace(list, h('div', { class: 'state-error', text: state.bus.error ?? '暫時取不到九巴到站資料' }));
    } else {
      replace(list, h('span', { class: 'skeleton', aria: { hidden: 'true' } }));
    }
    return;
  }

  const groups = groupByStop(state.bus.data, stops, auto ? PER_STOP : 6);
  if (groups.length === 0) {
    replace(list, h('div', { class: 'state-empty', text: auto ? '附近巴士站暫無即將到站班次' : '此站暫無即將到站班次' }));
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
          h('span', { text: auto ? walkLabel(group.stop.meters) : '指定站' }),
        ),
        ...group.rows.map(busRow),
      ),
    ),
  );
}