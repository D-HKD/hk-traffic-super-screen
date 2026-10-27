import type { NlbArrival } from './types';
import { array, isRecord, record } from '../lib/validate';
import { getJson, type RequestOptions } from './client';

/**
 * 新大嶼山巴士（NLB）口岸線：B2（元朗站 → 深圳灣）、B2P（天水圍天慈邨 → 深圳灣）。
 *
 * 官方端點：rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals
 * 只回傳抵達時間字串，所以這裡即時換算為「幾分鐘後」。
 */

interface NlbLine {
  readonly route: string;
  readonly routeId: string;
  readonly stopId: string;
  readonly dest: string;
}

/** 站號由 NLB 官方 stop.php?action=list 取得（2026-10-27 核實）。 */
export const NLB_LINES: readonly NlbLine[] = [
  { route: 'B2', routeId: '37', stopId: '161', dest: '深圳灣口岸' },
  { route: 'B2P', routeId: '33', stopId: '203', dest: '深圳灣口岸' },
];

function parseNlb(payload: unknown, line: NlbLine, now: Date): NlbArrival[] {
  const root = record(payload, 'NLB 回應');
  const list = array(root['arrivals'], 'NLB.arrivals');
  const out: NlbArrival[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const time = entry['estimatedArrivalTime'];
    if (typeof time !== 'string') continue;
    const at = new Date(time.replace(' ', 'T') + '+08:00');
    if (Number.isNaN(at.getTime())) continue;
    const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
    if (minutes < 0 || minutes > 180) continue;
    out.push({ route: line.route, dest: line.dest, minutes });
    if (out.length >= 2) break;
  }
  return out;
}

export async function fetchNlbArrivals(now: Date, options: RequestOptions): Promise<readonly NlbArrival[]> {
  const results = await Promise.allSettled(
    NLB_LINES.map((line) =>
      getJson('/api/nlb', { route: line.routeId, stop: line.stopId }, (raw) => parseNlb(raw, line, now), options),
    ),
  );

  const rows: NlbArrival[] = [];
  let failures = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else failures += 1;
  }
  if (rows.length === 0 && failures === NLB_LINES.length) throw new Error('口岸線資料暫時取不到');
  return rows.sort((a, b) => a.minutes - b.minutes);
}