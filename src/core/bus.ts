/**
 * 巴士到站分組（純函式，可測試）。
 *
 * 一個輕鐵站可能對應幾個巴士站（唔同街道／方向）。把班次按「上車站」分組，
 * 每組只顯示最近 N 班，令「去邊個月台上車」一目了然。
 */

export interface BusRowLike {
  readonly route: string;
  readonly dest: string;
  readonly minutes: number;
  readonly stopId: string;
}

export interface BusStopInput {
  readonly id: string;
  readonly name: string;
  readonly meters: number;
}

export interface BusGroup<T extends BusRowLike> {
  readonly stop: BusStopInput;
  readonly rows: readonly T[];
}

export function groupByStop<T extends BusRowLike>(
  rows: readonly T[],
  stops: readonly BusStopInput[],
  perStop = 2,
): BusGroup<T>[] {
  const groups: BusGroup<T>[] = [];

  for (const stop of stops) {
    const own = rows
      .filter((row) => row.stopId === stop.id)
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, perStop);
    if (own.length === 0) continue;
    groups.push({ stop, rows: own });
  }

  return groups;
}
