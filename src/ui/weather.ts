import type { Slice, WeatherReading } from '../api/types';
import { byId, setText } from '../lib/dom';

/**
 * 天氣只出現在頁首（溫度、濕度、粗略圖示），避免同一組數字在頁面出現兩次。
 * 唯一保留的額外資訊是「生效中警告」——它不重複溫度，而且比溫度重要得多，
 * 所以做成頁首一粒可點的標籤，詳情用 modal 顯示。
 *
 * 圖示由讀數粗略推導（警告 > 雨量 > 氣溫），唔係官方 icon code 對照表，
 * 只作視覺提示；實際狀態以文字為準。
 */
function iconFor(reading: WeatherReading | null): string {
  if (!reading) return '🌡';
  const warning = reading.warning ?? '';
  if (/雨|rain/i.test(warning)) return '🌧️';
  if (/風|颱|storm|typhoon/i.test(warning)) return '🌀';
  if ((reading.rainMaxMm ?? 0) > 0) return '🌦️';
  if ((reading.tempC ?? 0) >= 30) return '☀️';
  return '🌤️';
}

const FAR_STALE_MS = 3 * 60 * 60_000;

export function renderWeather(slice: Slice<WeatherReading>, now: Date): void {
  const reading = slice.data;

  setText(byId('weather-icon'), iconFor(reading));
  setText(byId('header-temp'), reading?.tempC !== null && reading?.tempC !== undefined ? `${reading.tempC}°C` : '--°C');
  setText(
    byId('header-humidity'),
    reading?.humidity !== null && reading?.humidity !== undefined ? `${reading.humidity}%` : '--%',
  );

  // 天文台 rhrread 本身以小時級更新，所以只在明顯過時（>3 小時）才加標記，
  // 避免頁首長年掛住「較舊」兩個字反而令人忽略真正過時的情況。
  const observed = reading?.observedAt ?? null;
  const tooOld = observed !== null && now.getTime() - observed.getTime() > FAR_STALE_MS;
  setText(
    byId('header-weather'),
    reading ? `${reading.station}觀測${tooOld ? '・資料過時' : ''}` : slice.state === 'error' ? '天氣更新失敗' : '未取得天氣',
  );

  const warningBtn = byId<HTMLButtonElement>('header-warning');
  if (reading?.warning) {
    setText(warningBtn, `⚠ ${reading.warning}`);
    warningBtn.title = reading.warning;
    warningBtn.hidden = false;
  } else {
    warningBtn.hidden = true;
  }
}
