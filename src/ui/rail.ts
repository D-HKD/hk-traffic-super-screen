import type { AppState, Arrival, LrtRow, Slice, StationArrivals } from '../api/types';
import { TML_STATIONS } from '../api/mtr';
import { LRT_GROUPS } from '../api/lrt';
import { byId, h, on, replace, setText } from '../lib/dom';
import { agoText, etaText, freshness } from '../lib/format';
import { lrtCarsIcon } from './rail-art';

type TmlSlice = Slice<Readonly<Partial<Record<string, StationArrivals>>>>;

export interface RailHandlers {
  selectLrtStation(name: string): void;
}

const STALE_MS = 45_000;
const DEAD_MS = 5 * 60_000;
const LRT_MAX_ROWS = 6;

function badgeText(slice: { state: string; updatedAt: Date | null }, now: Date): string {
  if (slice.state === 'error') return '更新失敗';
  if (slice.state === 'loading' || slice.updatedAt === null) return '載入中';
  const level = freshness(slice.updatedAt, now, STALE_MS, DEAD_MS);
  if (level === 'dead') return `過時（${agoText(slice.updatedAt, now)}）`;
  if (level === 'stale') return `延遲（${agoText(slice.updatedAt, now)}）`;
  return `已同步 ${agoText(slice.updatedAt, now)}`;
}

function etaClass(due: boolean): string {
  return due ? 'eta-value eta-soon' : 'eta-value';
}

/* ------------------------------------------------------------------ 屯馬綫 */

function mergeArrivals(station: StationArrivals): Arrival[] {
  const all = [...station.up, ...station.down];
  all.sort((a, b) => a.minutes - b.minutes);
  const seen = new Set<string>();
  const out: Arrival[] = [];
  for (const arrival of all) {
    if (seen.has(arrival.destCode)) continue;
    seen.add(arrival.destCode);
    out.push(arrival);
  }
  return out.slice(0, 3);
}

function arrivalRow(arrival: Arrival): HTMLElement {
  const eta = etaText(arrival.minutes);
  return h(
    'div',
    { class: 'eta-line' },
    h('b', { text: `往${arrival.destLabel}` }),
    h(
      'strong',
      { class: eta.due ? 'due' : undefined },
      h('span', { class: etaClass(eta.due), text: eta.value }),
      eta.unit ? h('em', { text: eta.unit }) : null,
      arrival.platform ? h('em', { class: 'plat', text: `月台 ${arrival.platform}` }) : null,
    ),
  );
}

function stationBody(station: StationArrivals | undefined, stationName: string, slice: TmlSlice): HTMLElement {
  if (!station) {
    if (slice.state === 'error') {
      return h('span', { class: 'state-error', text: slice.error ?? '暫時取不到這個站的班次' });
    }
    if (slice.data) {
      return h('span', { class: 'muted', text: `${stationName} 暫時取不到班次，稍後自動重試` });
    }
    return h('span', { class: 'skeleton', aria: { hidden: 'true' } });
  }

  const arrivals = mergeArrivals(station);
  if (arrivals.length === 0) {
    return h('span', { class: 'muted', text: `${stationName} 現時沒有即將到站班次` });
  }

  const wrap = h('div', { class: 'eta-group' });
  for (const arrival of arrivals) wrap.append(arrivalRow(arrival));
  return wrap;
}

/* ------------------------------------------------------------------ 輕鐵 */

/** 由路線號推導色相：只為一眼分辨路線，唔係官方路線色。 */
function routeHue(route: string): number {
  const digits = Number(route.replace(/\D/g, '')) || 0;
  return (digits * 37 + 18) % 360;
}

function stationRows(rows: readonly LrtRow[], stationCode: string): LrtRow[] {
  return rows.filter((row) => row.station === stationCode).sort((a, b) => a.minutes - b.minutes);
}

function nextMinutes(rows: readonly LrtRow[], stationCode: string): number | null {
  const own = stationRows(rows, stationCode);
  return own.length > 0 && own[0] ? own[0].minutes : null;
}

interface StationTab {
  readonly code: string;
  readonly name: string;
}

function lrtTab(tab: StationTab, rows: readonly LrtRow[], selected: boolean, handlers: RailHandlers): HTMLElement {
  const next = nextMinutes(rows, tab.code);
  const nextText = next === null ? '—' : next <= 1 ? '即將' : `${next} 分`;
  return h(
    'button',
    {
      class: 'lrt-tab',
      id: `lrt-tab-${tab.code}`,
      type: 'button',
      role: 'tab',
      aria: {
        selected: String(selected),
        label: `${tab.name}，${next === null ? '暫無班次' : `下一班 ${next} 分鐘`}`,
      },
      on: { click: () => handlers.selectLrtStation(tab.code) },
    },
    h('span', { class: 'lrt-tab-name', text: tab.name }),
    h('small', { class: next !== null && next <= 1 ? 'soon' : undefined, text: nextText }),
  );
}

function lrtRow(row: LrtRow): HTMLElement {
  const eta = etaText(row.minutes);
  const hue = routeHue(row.route);
  return h(
    'div',
    { class: 'lrt-row lrt-row-main' },
    h('span', { class: 'route-chip', style: `--rt:${hue}`, text: row.route }),
    h(
      'div',
      { class: 'lrt-info' },
      h('b', { text: `往${row.dest}` }),
      h(
        'small',
        {},
        row.platform ? `月台 ${row.platform}` : '月台不詳',
        row.cars ? lrtCarsIcon(row.cars, hue) : null,
      ),
    ),
    h(
      'strong',
      { class: eta.due ? 'due' : undefined },
      h('span', { class: etaClass(eta.due), text: eta.value }),
      eta.unit ? h('em', { text: eta.unit }) : null,
    ),
  );
}

function renderLrt(slice: Slice<readonly LrtRow[]>, selected: string, handlers: RailHandlers): void {
  const rows = slice.data ?? [];
  const tabs: readonly StationTab[] = LRT_GROUPS.map((group) => ({ code: group.station, name: group.name }));
  const active = tabs.find((tab) => tab.code === selected)?.code ?? tabs[0]?.code ?? '500';

  // 鍵盤：ArrowLeft / ArrowRight 切換站，並保留焦點（roving tabindex）。
  const tabButtons = tabs.map((tab) => lrtTab(tab, rows, tab.code === active, handlers));
  tabButtons.forEach((button, index) => {
    button.tabIndex = tabs[index]?.code === active ? 0 : -1;
    on(button, 'keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      if (!next) return;
      handlers.selectLrtStation(next.code);
      window.setTimeout(() => document.getElementById(`lrt-tab-${next.code}`)?.focus(), 0);
    });
  });
  replace(byId('lrt-tabs'), ...tabButtons);

  const main = byId('LRT-eta');
  const own = stationRows(rows, active);
  const activeName = tabs.find((tab) => tab.code === active)?.name ?? active;

  if (!slice.data) {
    if (slice.state === 'error') {
      replace(main, h('div', { class: 'state-error', text: slice.error ?? '暫時取不到輕鐵班次' }));
    } else {
      replace(
        main,
        h('span', { class: 'skeleton', aria: { hidden: 'true' } }),
        h('span', { class: 'skeleton', aria: { hidden: 'true' } }),
      );
    }
  } else if (own.length === 0) {
    replace(main, h('div', { class: 'state-empty', text: `${activeName}站現時沒有即將到站班次` }));
  } else {
    replace(main, ...own.slice(0, LRT_MAX_ROWS).map(lrtRow));
  }

  const others = tabs.filter((tab) => tab.code !== active);
  replace(
    byId('lrt-others'),
    ...others.map((tab) => {
      const next = nextMinutes(rows, tab.code);
      return h(
        'button',
        {
          class: 'lrt-other',
          type: 'button',
          aria: { label: `切換到${tab.name}站` },
          on: { click: () => handlers.selectLrtStation(tab.code) },
        },
        h('b', { text: tab.name }),
        h('span', { class: next !== null && next <= 1 ? 'soon' : undefined, text: next === null ? '—' : next <= 1 ? '即將' : `${next} 分` }),
      );
    }),
  );
}

/* ------------------------------------------------------------------ 入口 */

function tmlStationRow(station: { readonly code: string; readonly name: string }, slice: TmlSlice): HTMLElement {
  return h(
    'article',
    { class: 'station-row', dataset: { code: station.code } },
    h('div', { class: 'station-name' }, h('b', { text: station.name }), h('small', { text: station.code })),
    h(
      'div',
      { id: `${station.code}-eta`, class: 'eta-list' },
      stationBody(slice.data?.[station.code], station.name, slice),
    ),
  );
}

export function renderRail(state: AppState, now: Date, handlers: RailHandlers): void {
  replace(byId('tml-stack'), ...TML_STATIONS.map((station) => tmlStationRow(station, state.tml)));
  setText(byId('tml-badge'), badgeText(state.tml, now));

  renderLrt(state.lrt, state.ui.lrtStation, handlers);
  setText(byId('lrt-badge'), badgeText(state.lrt, now));

  const latest = [state.tml.updatedAt, state.lrt.updatedAt].reduce<Date | null>((newest, at) => {
    if (!at) return newest;
    if (!newest) return at;
    return at > newest ? at : newest;
  }, null);
  setText(byId('rail-update'), latest ? `更新 ${latest.toLocaleTimeString('zh-HK', { hour12: false })}` : '尚未更新');
}
