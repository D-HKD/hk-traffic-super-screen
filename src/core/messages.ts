import type { MessageState, Severity, TrafficItem } from '../api/types';
import { DISTRICT_KEYWORDS, REOPENED_PATTERNS, ROADS } from '../config.ts';

/**
 * 交通消息語意層（純函式，可測試）。
 *
 * 舊版有兩個問題：
 * 1. 用一堆互相重疊的 regex 猜嚴重程度，「封閉」同時出現在紅色和黃色規則；
 * 2. 完全冇處理「現已解封」——解封消息會被當成新警報彈出來，實際情況剛好相反。
 * 這裡先用「狀態」再判斷「嚴重程度」，解封消息一律降為一般消息。
 */



const CLOSURE_PATTERNS: readonly RegExp[] = [
  /全線封閉/,
  /封閉/,
  /不能通行/,
  /無法通行/,
  /塌樹/,
  /塌石/,
  /山泥傾瀉/,
  /水浸/,
  /地陷/,
  /致命/,
  /死亡/,
  /多人受傷/,
];

const INCIDENT_PATTERNS: readonly RegExp[] = [
  /交通意外/,
  /意外/,
  /相撞/,
  /壞車/,
  /故障車/,
  /阻塞/,
  /擠塞/,
  /車龍/,
  /慢駛/,
  /改道/,
  /道路工程/,
  /維修/,
  /受阻/,
  /延誤/,
];

export function isReopened(content: string): boolean {
  return REOPENED_PATTERNS.some((re) => re.test(content));
}

export function classifyState(statusText: string, content: string): MessageState {
  if (isReopened(content)) return 'reopened';
  if (/新增|NEW/i.test(statusText)) return 'new';
  if (/更新|UPDATED|UPDATING/i.test(statusText)) return 'updated';
  return 'other';
}

/** 解封 > 封閉 > 事故 > 一般。 */
export function classifySeverity(heading: string, detail: string, content: string): Severity {
  if (isReopened(content)) return 'notice';
  const haystack = `${heading} ${detail} ${content}`;
  if (CLOSURE_PATTERNS.some((re) => re.test(haystack))) return 'closure';
  if (INCIDENT_PATTERNS.some((re) => re.test(haystack))) return 'incident';
  return 'notice';
}

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  closure: '道路受阻',
  incident: '交通事故',
  notice: '一般消息',
};

export const STATE_LABEL: Readonly<Record<MessageState, string>> = {
  new: '新增',
  updated: '更新',
  reopened: '已解封',
  other: '消息',
};

export interface RoadDef {
  readonly id: string;
  readonly name: string;
  readonly patterns: readonly RegExp[];
}

/** 只按「路名」比對，唔會把「屯門」任何消息都當成屯門公路出事。 */
export { ROADS };

export interface RoadStatus {
  readonly road: RoadDef;
  readonly count: number;
  readonly latest: TrafficItem | null;
  readonly closed: boolean;
}

function matches(item: TrafficItem, patterns: readonly RegExp[]): boolean {
  const haystack = `${item.heading} ${item.detail} ${item.content} ${item.location}`;
  return patterns.some((re) => re.test(haystack));
}

export function roadStatuses(items: readonly TrafficItem[]): RoadStatus[] {
  return ROADS.map((road) => {
    const hits = items.filter((item) => matches(item, road.patterns));
    const latest = hits.reduce<TrafficItem | null>((newest, item) => {
      if (!item.announcedAt) return newest;
      if (!newest?.announcedAt) return item;
      return item.announcedAt > newest.announcedAt ? item : newest;
    }, null);
    return {
      road,
      count: hits.length,
      latest,
      closed: hits.some((item) => item.severity === 'closure' && item.msgState !== 'reopened'),
    };
  });
}

/** 屯門／元朗／天水圍相關消息（標題、內容、地點任一命中）。 */


export function isRelevantToDistrict(item: TrafficItem): boolean {
  const haystack = `${item.heading} ${item.detail} ${item.content} ${item.location}`;
  return DISTRICT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function sortByNewest(items: readonly TrafficItem[]): TrafficItem[] {
  return [...items].sort((a, b) => {
    const at = a.announcedAt?.getTime() ?? 0;
    const bt = b.announcedAt?.getTime() ?? 0;
    return bt - at;
  });
}
