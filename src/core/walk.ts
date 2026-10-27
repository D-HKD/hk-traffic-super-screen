/**
 * 步行時間估算。
 *
 * 用直線距離 ÷ 80 米/分鐘（成人悠閒步速約 1.2–1.4 m/s，取較慢的 1.33 m/s ≈ 80 m/min）。
 * 係**估算**，唔係路線距離；UI 有寫明。
 */

export const WALK_METERS_PER_MINUTE = 80;

export function walkMinutes(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
}

export function walkLabel(meters: number): string {
  const minutes = walkMinutes(meters);
  return minutes === 0 ? '—' : `步行約 ${minutes} 分鐘`;
}
