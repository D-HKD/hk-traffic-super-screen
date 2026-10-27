import type { AlertFilter, RoadSnapshot, Severity, Slice, TrafficItem } from '../api/types';
import { SEVERITY_LABEL, STATE_LABEL, isRelevantToDistrict, roadStatuses, sortByNewest } from '../core/messages';
import { ROAD_LIMITS, SPEED_BAND_LABEL, congestionBand, ratioPercent, slowestDirection, speedRatio } from '../core/speed';
import { byId, h, replace, setText } from '../lib/dom';
import { agoText, clockText } from '../lib/format';

const MAX_LISTED = 6;
const DETAIL_LIMIT = 180;

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function timeLabel(item: TrafficItem): string {
  return item.announcedAt ? clockText(item.announcedAt) : '時間不詳';
}

export function renderRoads(
  traffic: Slice<readonly TrafficItem[]>,
  snapshot: Slice<RoadSnapshot>,
  now: Date,
): void {
  const list = byId('road-list');
  const items = traffic.data ?? [];

  if (traffic.state === 'error' && items.length === 0 && !snapshot.data) {
    replace(list, h('div', { class: 'state-error', text: traffic.error ?? '暫時取不到運輸署消息' }));
    return;
  }
  if (traffic.state === 'loading' && items.length === 0 && !snapshot.data) {
    replace(list, h('span', { class: 'skeleton', aria: { hidden: 'true' } }));
    return;
  }

  const statuses = roadStatuses(items);
  const speedById = new Map((snapshot.data?.roads ?? []).map((road) => [road.id, road]));

  replace(
    list,
    ...statuses.map((status) => {
      const speed = speedById.get(status.road.id);
      const kmh = speed?.kmh ?? null;
      const limit = ROAD_LIMITS[status.road.id];
      const ratio = speedRatio(kmh, limit);
      const band = congestionBand(ratio);
      const dot =
        band === 'smooth'
          ? 'ok'
          : band === 'slow'
            ? 'watch'
            : band === 'jam'
              ? 'bad'
              : status.closed
                ? 'bad'
                : status.count > 0
                  ? 'watch'
                  : 'ok';
      const main = kmh !== null ? `${Math.round(kmh)} km/h` : '無車速數據';
      const messagePart = status.count === 0 ? '無相關消息' : `${status.count} 則消息`;
      const dirs = speed?.dirs ?? [];
      const slower = slowestDirection(dirs);
      const sub =
        ratio !== null && limit !== undefined
          ? `${SPEED_BAND_LABEL[band]}（${ratioPercent(ratio)}／限速 ${limit}）・${messagePart}`
          : `${SPEED_BAND_LABEL[band]}・${messagePart}`;

      return h(
        'div',
        { class: 'road-cell', title: speed ? `${speed.detectors} 個探測器平均` : '未取得探測器數據' },
        h('b', { text: status.road.name }),
        h('div', { class: 'road-state' }, h('span', { class: `road-dot ${dot}` }), h('strong', { text: main })),
        h('small', { class: 'road-sub', text: sub }),
        dirs.length > 1
          ? h('small', {
              class: 'road-dirs',
              text: `${dirs.map((d) => `${d.dir.replace('行', '')} ${Math.round(d.kmh)}`).join('・')}${slower ? `（${slower.dir}較慢）` : ''}`,
            })
          : null,
      );
    }),
  );

  const latest = [traffic.updatedAt, snapshot.updatedAt].reduce<Date | null>((newest, at) => {
    if (!at) return newest;
    if (!newest) return at;
    return at > newest ? at : newest;
  }, null);
  setText(
    byId('traffic-update'),
    latest
      ? `更新 ${agoText(latest, now)}${snapshot.data?.period ? `・車速 ${snapshot.data.period}` : ''}`
      : '尚未更新',
  );
}

function severityClass(severity: Severity): string {
  return severity === 'closure' ? 'closure' : severity === 'incident' ? 'incident' : 'notice';
}

export function renderMessages(traffic: Slice<readonly TrafficItem[]>, filter: AlertFilter): void {
  const list = byId('alert-list');
  const items = traffic.data;

  if (!items) {
    if (traffic.state === 'error') {
      replace(list, h('div', { class: 'state-error', text: traffic.error ?? '暫時取不到交通消息' }));
    } else {
      replace(list, h('span', { class: 'loading', text: '載入中…' }));
    }
    setText(byId('alert-time'), '--:--:--');
    return;
  }

  const sorted = sortByNewest(items);
  const filtered =
    filter === 'severe'
      ? sorted.filter((item) => item.severity !== 'notice' && item.msgState !== 'reopened')
      : filter === 'latest'
        ? sorted.slice(0, 1)
        : sorted;

  if (filtered.length === 0) {
    replace(list, h('div', { class: 'state-empty', text: '目前沒有合乎篩選條件的消息' }));
  } else {
    replace(
      list,
      ...filtered.slice(0, MAX_LISTED).map((item) =>
        h(
          'article',
          { class: `alert-item ${severityClass(item.severity)}` },
          h(
            'div',
            {},
            h('b', { text: item.heading }),
            h('span', { class: `severity ${severityClass(item.severity)}`, text: SEVERITY_LABEL[item.severity] }),
            h('span', { class: `msg-state ${item.msgState}`, text: STATE_LABEL[item.msgState] }),
            h('span', { class: 'alert-time', text: timeLabel(item) }),
          ),
          h('p', { text: `${item.location ? `${item.location}：` : ''}${truncate(item.content || item.detail, DETAIL_LIMIT)}` }),
        ),
      ),
    );
  }

  const latestAt = sorted[0]?.announcedAt ?? null;
  setText(byId('alert-time'), latestAt ? `最近消息 ${clockText(latestAt)}` : '--:--:--');
}

/** 屯元天相關消息，供首頁「與你有關」卡使用。 */
export function relevantItems(traffic: Slice<readonly TrafficItem[]>): TrafficItem[] {
  const items = traffic.data ?? [];
  return sortByNewest(items.filter(isRelevantToDistrict));
}

/** 首頁「與屯元天有關」卡：只顯示真正相關的消息，並如實講「冇」。 */
export function renderRelevant(traffic: Slice<readonly TrafficItem[]>, filter: AlertFilter): void {
  const list = byId('personal-alert-list');
  const relevant = relevantItems(traffic);

  if (!traffic.data) {
    replace(list, h('div', { class: 'empty', text: traffic.state === 'error' ? '暫時取不到交通消息' : '等待交通消息…' }));
    return;
  }

  const filtered =
    filter === 'severe'
      ? relevant.filter((item) => item.severity !== 'notice' && item.msgState !== 'reopened')
      : filter === 'latest'
        ? relevant.slice(0, 1)
        : relevant;

  if (filtered.length === 0) {
    replace(
      list,
      h('div', { class: 'empty', text: filter === 'all' ? '屯元天暫時沒有相關交通消息' : '沒有符合篩選條件的消息' }),
    );
    return;
  }

  replace(
    list,
    ...filtered.slice(0, 3).map((item) =>
      h(
        'div',
        { class: `personal-alert ${severityClass(item.severity)}` },
        h('small', { text: timeLabel(item) }),
        h('b', { text: item.heading }),
        h('p', { text: truncate(item.content || item.detail, 130) }),
      ),
    ),
  );
}
