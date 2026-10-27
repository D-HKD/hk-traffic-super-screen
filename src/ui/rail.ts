import type { AppState, Arrival, LrtRow, Slice, StationArrivals } from '../api/types';
import { TML_STATIONS } from '../api/mtr';
import { byId, h, on, replace, setText } from '../lib/dom';
import { LRT_STATIONS, haversineKm } from '../core/places';
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
      h('small', {}, row.platform ? `月台 ${row.platform}` : '月台不詳', row.cars ? lrtCarsIcon(row.cars, hue) : null),
    ),
    h(
      'strong',
      { class: eta.due ? 'due' : undefined },
      h('span', { class: etaClass(eta.due), text: eta.value }),
      eta.unit ? h('em', { text: eta.unit }) : null,
    ),
  );
}

/**
 * 68 個輕鐵站不可能用 tab；改成按區分組的下拉選單（只建立一次）。
 */
export function initLrtPicker(handlers: RailHandlers): void {
  const select = byId<HTMLSelectElement>('lrt-station');
  if (select.options.length > 0) return;

  for (const area of ['屯門', '天水圍', '元朗']) {
    const group = document.createElement('optgroup');
    group.label = area;
    const inArea = LRT_STATIONS.filter((station) => station.area === area).sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-Hant'),
    );
    for (const station of inArea) {
      const option = document.createElement('option');
      option.value = station.code;
      option.textContent = station.name;
      group.appendChild(option);
    }
    select.appendChild(group);
  }

  on(select, 'change', () => handlers.selectLrtStation(select.value));
}

function renderLrt(slice: Slice<readonly LrtRow[]>, selected: string, handlers: RailHandlers): void {
  const rows = slice.data ?? [];
  const known = LRT_STATIONS.find((station) => station.code === selected);
  const active = known ?? LRT_STATIONS[0];

  const select = document.getElementById('lrt-station') as HTMLSelectElement | null;
  if (select && active && select.value !== active.code) select.value = active.code;

  const activeCode = active?.code ?? '';
  const own = stationRows(rows, activeCode);
  const activeName = active?.name ?? activeCode;

  const main = byId('LRT-eta');
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

  // 「附近站」：用座標找最近 2 個其他站，方便一按跳過去。
  const nearby = active
    ? LRT_STATIONS.filter((station) => station.code !== active.code)
        .map((station) => ({ station, km: haversineKm(active, station) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 2)
    : [];

  replace(
    byId('lrt-others'),
    ...nearby.map(({ station, km }) =>
      h(
        'button',
        {
          class: 'lrt-other',
          type: 'button',
          aria: { label: `切換到${station.name}站，距離 ${km.toFixed(1)} 公里` },
          on: { click: () => handlers.selectLrtStation(station.code) },
        },
        h('b', { text: station.name }),
        h('span', { text: km < 1 ? `${Math.round(km * 1000)} 米` : `${km.toFixed(1)} 公里` }),
      ),
    ),
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
