import type { PortArrival } from './types.ts';
import { array, isRecord, record } from '../lib/validate.ts';
import { getJson, type RequestOptions } from './client.ts';
import { settleAll } from '../lib/promise.ts';

/**
 * 口岸線：往深圳灣口岸的巴士。
 *
 * - 新大嶼山巴士（NLB）B2／B2P：rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals
 * - 城巴（CTB）B3 系：rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop}/{route}
 *
 * 城巴回應同時包含兩個方向，必須按 dir 過濾（'O' = outbound，即離開屯門）。
 * 站號全部於 2026-10-27 以官方 API 核實。
 */

type PortLine =
  | { readonly operator: 'NLB'; readonly route: string; readonly from: string; readonly dest: string; readonly routeId: string; readonly stopId: string }
  | { readonly operator: 'CTB'; readonly route: string; readonly from: string; readonly dest: string; readonly stopId: string };

export const PORT_LINES: readonly PortLine[] = [
  { operator: 'NLB', route: 'B2', from: '元朗站', dest: '深圳灣口岸', routeId: '37', stopId: '161' },
  { operator: 'NLB', route: 'B2P', from: '天水圍天慈邨', dest: '深圳灣口岸', routeId: '33', stopId: '203' },
  { operator: 'CTB', route: 'B3', from: '屯門碼頭', dest: '深圳灣口岸', stopId: '003194' },
  { operator: 'CTB', route: 'B3A', from: '山景邨', dest: '深圳灣口岸', stopId: '003201' },
  { operator: 'CTB', route: 'B3X', from: '屯門市中心', dest: '深圳灣口岸', stopId: '003198' },
  { operator: 'CTB', route: 'B3M', from: '屯門站', dest: '深圳灣口岸', stopId: '003361' },
];

function minutesFrom(iso: unknown, now: Date): number | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  return minutes < 0 || minutes > 180 ? null : minutes;
}

function parseNlb(payload: unknown, line: PortLine, now: Date): PortArrival[] {
  const root = record(payload, 'NLB 回應');
  const list = array(root['arrivals'], 'NLB.arrivals');
  const out: PortArrival[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const time = entry['estimatedArrivalTime'];
    const at = typeof time === 'string' ? new Date(`${time.replace(' ', 'T')}+08:00`) : null;
    const minutes = at && !Number.isNaN(at.getTime()) ? Math.round((at.getTime() - now.getTime()) / 60_000) : null;
    if (minutes === null || minutes < 0 || minutes > 180) continue;
    out.push({ operator: line.operator, route: line.route, from: line.from, dest: line.dest, minutes });
    if (out.length >= 1) break;
  }
  return out;
}

function parseCtb(payload: unknown, line: PortLine, now: Date): PortArrival[] {
  const root = record(payload, '城巴回應');
  const list = array(root['arrivals'], 'CTB.arrivals');
  const out: PortArrival[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    // 只取離屯門方向（dir 'O'），否則會混入返屯門嘅班次。
    if (entry['dir'] !== 'O') continue;
    const minutes = minutesFrom(entry['eta'], now);
    if (minutes === null) continue;
    out.push({ operator: line.operator, route: line.route, from: line.from, dest: line.dest, minutes });
    if (out.length >= 1) break;
  }
  return out;
}

export async function fetchPortArrivals(now: Date, options: RequestOptions): Promise<readonly PortArrival[]> {
  const results = await settleAll(
    PORT_LINES.map((line) => {
      if (line.operator === 'NLB') {
        return getJson('/api/nlb', { route: line.routeId, stop: line.stopId }, (raw) => parseNlb(raw, line, now), options);
      }
      return getJson('/api/ctb', { route: line.route, stop: line.stopId }, (raw) => parseCtb(raw, line, now), options);
    }),
  );

  const rows: PortArrival[] = [];
  let failures = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else failures += 1;
  }
  if (rows.length === 0 && failures === PORT_LINES.length) throw new Error('口岸線資料暫時取不到');
  return rows.sort((a, b) => a.minutes - b.minutes);
}