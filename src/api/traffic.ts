import { classifySeverity, classifyState, sortByNewest } from '../core/messages';
import { parseHkDateTime } from '../lib/format';
import type { TrafficItem } from './types';
import { getXml, type RequestOptions } from './client';

export interface TrafficFields {
  readonly id: string;
  readonly heading: string;
  readonly detail: string;
  readonly content: string;
  readonly location: string;
  readonly direction: string;
  readonly status: string;
  readonly announcedAt: Date | null;
}

/** 純函式：由原始欄位推導嚴重程度同狀態，方便測試。 */
export function toTrafficItem(fields: TrafficFields): TrafficItem {
  return {
    ...fields,
    severity: classifySeverity(fields.heading, fields.detail, fields.content),
    msgState: classifyState(fields.status, fields.content),
  };
}

function nodeText(node: Element, tag: string): string {
  return node.querySelector(tag)?.textContent?.trim() ?? '';
}

export function parseTrafficNews(xml: string): TrafficItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('運輸署回應不是有效 XML');

  const items: TrafficItem[] = [];
  const seen = new Set<string>();

  for (const node of doc.querySelectorAll('message')) {
    const content = nodeText(node, 'CONTENT_CN');
    const heading = nodeText(node, 'INCIDENT_HEADING_CN');
    if (!content && !heading) continue;

    const id = nodeText(node, 'ID') || nodeText(node, 'INCIDENT_NUMBER') || `idx-${items.length}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const announcedRaw = nodeText(node, 'ANNOUNCEMENT_DATE');
    items.push(
      toTrafficItem({
        id,
        heading: heading || '交通消息',
        detail: nodeText(node, 'INCIDENT_DETAIL_CN'),
        content,
        location: nodeText(node, 'LOCATION_CN'),
        direction: nodeText(node, 'DIRECTION_CN'),
        status: nodeText(node, 'INCIDENT_STATUS_CN'),
        announcedAt: announcedRaw ? parseHkDateTime(announcedRaw) : null,
      }),
    );
  }

  return sortByNewest(items);
}

export async function fetchTrafficNews(options: RequestOptions): Promise<readonly TrafficItem[]> {
  return getXml('/trafficnews', {}, parseTrafficNews, options);
}
