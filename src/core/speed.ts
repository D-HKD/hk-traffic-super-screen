import { ROADS, SPEED_THRESHOLDS } from '../config.ts';

/**
 * 車速分級：改用「實測車速 ÷ 該路限速」，唔再用固定 km/h 門檻。
 *
 * 限速來源：運輸署「道路網絡（第二代）－ 車速限制」KML
 * （static.data.gov.hk/td/road-network-v2/SPEED_LIMIT.kmz，4,385 段，2026-10-27 下載）。
 * 該 KML 只有 SPEED_LIMIT + 幾何，冇路名，所以用「探測器座標 → 最近路段」做空間匹配，
 * 再取每條路嘅眾數（括號內為分佈）。
 *
 * 限制：一條路可以有幾段唔同限速，這裡只取一個代表值；所以 UI 會同時顯示所用限速，
 * 用戶睇得到個假設，唔會被隱藏。
 */

export const ROAD_LIMITS: Readonly<Record<string, number>> = Object.fromEntries(
  ROADS.map((road) => [road.id, road.limit]),
);


export type SpeedBand = 'smooth' | 'slow' | 'jam' | 'unknown';

/** 相對限速的比例：門檻見 config.ts 的 SPEED_THRESHOLDS。 */
export const SMOOTH_RATIO = SPEED_THRESHOLDS.smooth;
export const SLOW_RATIO = SPEED_THRESHOLDS.slow;

export function speedRatio(kmh: number | null, limit: number | undefined): number | null {
  if (kmh === null || !Number.isFinite(kmh) || limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }
  return kmh / limit;
}

export function congestionBand(ratio: number | null): SpeedBand {
  if (ratio === null || !Number.isFinite(ratio)) return 'unknown';
  if (ratio >= SMOOTH_RATIO) return 'smooth';
  if (ratio >= SLOW_RATIO) return 'slow';
  return 'jam';
}

export const SPEED_BAND_LABEL: Readonly<Record<SpeedBand, string>> = {
  smooth: '暢順',
  slow: '緩慢',
  jam: '擠塞',
  unknown: '無車速數據',
};

/** 顯示用百分比；超過 100% 就顯示實際值（車速可以高過限速）。 */
export function ratioPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '--';
  return `${Math.round(ratio * 100)}%`;
}

/**
 * 兩個方向相差幾多才值得單獨標示？
 * 預設：最慢方向低過最快方向的 80% 就當「一邊明顯較慢」。
 */
export function slowestDirection(
  dirs: readonly { readonly dir: string; readonly kmh: number }[],
  threshold = SPEED_THRESHOLDS.directionSpread,
): { dir: string; kmh: number } | null {
  if (dirs.length < 2) return null;
  const sorted = [...dirs].sort((a, b) => a.kmh - b.kmh);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  if (!worst || !best || best.kmh <= 0) return null;
  return worst.kmh < best.kmh * threshold ? { dir: worst.dir, kmh: worst.kmh } : null;
}