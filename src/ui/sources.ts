import type { AppState, Slice } from '../api/types';
import { byId, h, replace } from '../lib/dom';
import { agoText, clockText, freshness } from '../lib/format';

interface SourceRow {
  readonly name: string;
  readonly slice: Slice<unknown>;
  readonly meta: string;
}

function stateOf(slice: Slice<unknown>, now: Date): { label: string; cls: string } {
  if (slice.state === 'error') return { label: '失敗', cls: 'error' };
  if (slice.state === 'ok' && slice.error) return { label: '部分', cls: 'stale' };
  if (!slice.updatedAt) return { label: '等待', cls: 'idle' };
  const level = freshness(slice.updatedAt, now, 5 * 60_000, 30 * 60_000);
  if (level === 'dead') return { label: '過時', cls: 'error' };
  if (level === 'stale') return { label: '延遲', cls: 'stale' };
  return { label: '正常', cls: 'ok' };
}

/**
 * 資料健康面板。
 * 舊版寫死「● 系統正常」——無論實際連線如何都顯示正常。這裡逐個來源講清楚。
 */
export function renderSources(state: AppState, now: Date): void {
  const tmlCount = state.tml.data ? Object.keys(state.tml.data).length : 0;
  const rows: SourceRow[] = [
    {
      name: '屯馬綫到站（MTR）',
      slice: state.tml,
      meta: state.tml.error ?? `${tmlCount} / 3 個站有班次資料`,
    },
    {
      name: '輕鐵到站（MTR）',
      slice: state.lrt,
      meta: state.lrt.error ?? `${state.lrt.data?.length ?? 0} 班即將到站`,
    },
    {
      name: '九巴到站（KMB）',
      slice: state.bus,
      meta: state.bus.error ?? `${state.bus.data?.length ?? 0} 班即將到站`,
    },
    {
      name: '運輸署交通消息',
      slice: state.traffic,
      meta: state.traffic.error ?? `${state.traffic.data?.length ?? 0} 則消息`,
    },
    {
      name: '運輸署車速（探測器）',
      slice: state.roads,
      meta: state.roads.error ?? `${state.roads.data?.roads.filter((road) => road.kmh !== null).length ?? 0} / 4 條路有數據`,
    },
    {
      name: '香港天文台天氣',
      slice: state.weather,
      meta: state.weather.error ?? `${state.weather.data?.station ?? '未取得'}${state.weather.data?.observedAt ? ` · 觀測 ${clockText(state.weather.data.observedAt)}` : ''}`,
    },
  ];

  replace(
    byId('source-list'),
    ...rows.map((row) => {
      const status = stateOf(row.slice, now);
      const time = row.slice.updatedAt ? `${clockText(row.slice.updatedAt)}（${agoText(row.slice.updatedAt, now)}）` : '未有';
      return h(
        'div',
        { class: 'source-row' },
        h('b', {}, row.name, h('span', { class: `src-state ${status.cls}`, text: status.label })),
        h('span', { class: 'src-time', text: time }),
        h('span', { class: 'src-meta', text: row.meta }),
      );
    }),
  );
}
