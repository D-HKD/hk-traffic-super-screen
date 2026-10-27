/**
 * ⚙️ 全站設定檔 —— 想改嘢，改呢個檔案就夠。
 *
 * 這裡集中了：
 *   1. 車站清單（屯馬綫 / 輕鐵）同附近巴士站
 *   2. 道路清單、路名比對規則、各路的代表性限速
 *   3. 車速分級門檻、資料刷新間隔、Proxy 位址
 *   4. 地區關鍵詞（決定邊啲交通消息算「同你有關」）
 *
 * 改完之後跑 `pnpm check`（型別 + 測試 + build），再 `pnpm build` 出 dist。
 * 注意：Worker 有自己的白名單（worker/src/index.js 的 TML_STATIONS），加站時兩邊都要改。
 */

/* ------------------------------------------------------------------ 基本 */

export const APP = {
  /** 顯示名稱，會出現在標題同 PWA。 */
  name: '香港交通警報中心',
  version: '2.4',
  /** 自訂 Worker 位址；留空就用預設。亦可以用 .env.local 的 VITE_PROXY_BASE 覆蓋。 */
  proxyBase: 'https://hk-traffic-super-proxy.idyl-2014061.workers.dev',
} as const;

/** 各資料源的輪詢間隔（毫秒）。數字越細越即時，但上游負載越高。 */
export const REFRESH_MS = {
  tml: 30_000,
  lrt: 30_000,
  bus: 60_000,
  roads: 60_000,
  traffic: 45_000,
  weather: 120_000,
} as const;

/** 車速分級：實測車速 ÷ 該路限速。 */
export const SPEED_THRESHOLDS = {
  /** ≥ 85% 當暢順 */
  smooth: 0.85,
  /** ≥ 60% 當緩慢；低於就當擠塞 */
  slow: 0.6,
  /** 兩個方向相差超過呢個比例，就標明邊個方向較慢 */
  directionSpread: 0.8,
} as const;

/* ------------------------------------------------------------------ 車站 */

/**
 * 屯馬綫（前西鐵綫）。`lat` / `lon` 用於「最近車站」同 GPS 自動選站。
 * 座標來源：OpenStreetMap 的 MTR 站號（`ref` = TIS / YUL …）stop_position。
 *
 * 加站步驟：
 *   1. 在這裡加一項
 *   2. 在 worker/src/index.js 的 TML_STATIONS Set 加同一個 code
 *   3. 跑 `pnpm check`
 */
export const TML_STATIONS = [
  { code: 'TIS', name: '天水圍', lat: 22.4579, lon: 113.9997 },
  { code: 'LOP', name: '朗屏', lat: 22.4447, lon: 114.0343 },
  { code: 'YUL', name: '元朗', lat: 22.446, lon: 114.0352 },
  { code: 'SIH', name: '兆康', lat: 22.4118, lon: 113.9789 },
  { code: 'TUM', name: '屯門', lat: 22.3947, lon: 113.973 },
] as const;

/**
 * 輕鐵站。`station` 係 MTR 的 station_id（API 用），`name` 係顯示名，
 * `routes` 係要顯示的路線白名單（避免列出該站全部路線），
 * `bus` 係附近九巴站（id 為九巴 16 位站號，meters 為直線距離）。
 *
 * 加站步驟：同上，但 worker 唔需要改（輕鐵走 /mtr?url= 通用端點）。
 */
export const LRT_GROUPS = [
  {
    station: '500',
    name: '天榮',
    routes: ['705', '706', '751', '751P'],
    lat: 22.4596764,
    lon: 114.0023185,
    bus: [
      { id: '0AE307AC4840B867', name: '天水圍市中心 TN940', meters: 168 },
      { id: 'AA92A3F2775F4F69', name: '天水圍市中心 TN945', meters: 168 },
    ],
  },
  {
    station: '295',
    name: '屯門',
    routes: ['507', '610', '614', '614P', '615', '615P'],
    lat: 22.3938221,
    lon: 113.973107,
    bus: [
      { id: '79D68EE7C6CBAB9D', name: '屯門站總站 TM954', meters: 156 },
      { id: 'D74B67D55C63895F', name: '屯門站總站 TM953', meters: 132 },
    ],
  },
  {
    station: '240',
    name: '兆禧',
    routes: ['507', '614', '614P'],
    lat: 22.3752391,
    lon: 113.9668753,
    bus: [
      { id: '216AEF6F6541ECF1', name: '湖景邨湖畔樓 TM646', meters: 143 },
      { id: '4B6D9BB197225DBE', name: '湖景邨湖畔樓 TM645', meters: 143 },
    ],
  },
] as const;

/* ------------------------------------------------------------------ 道路 */

/**
 * 主要道路。
 *   `patterns` 用於比對運輸署交通消息（只比對消息內文，唔代表車速）
 *   `limit` 係該路的代表性限速（km/h），用於「實測 ÷ 限速」分級
 *
 * 限速來源：運輸署「道路網絡（第二代）－ 車速限制」KML，用探測器座標做最近路段
 * 空間匹配後取眾數（括號內為分佈）。一條路可能有多段不同限速，這裡只取代表值，
 * UI 會顯示所用限速，所以誤差係睇得見的。
 */
export const ROADS = [
  {
    id: 'tuenmun',
    name: '屯門公路',
    patterns: [/屯門公路/, /Tuen Mun Road/i],
    limit: 70, // 75 個探測器：70 ×52、80 ×23
  },
  {
    id: 'yuenlong',
    name: '元朗公路',
    patterns: [/元朗公路/, /Yuen Long Highway/i],
    limit: 80, // 36 個：80 ×33、70 ×2、100 ×1
  },
  {
    id: 'castle',
    name: '青山公路',
    patterns: [/青山公路/, /Castle Peak Road/i],
    limit: 70, // 28 個：70 ×16、80 ×12
  },
  {
    id: 'tailam',
    name: '大欖隧道',
    patterns: [/大欖隧道/, /Tai Lam Tunnel/i],
    limit: 80, // 只有 2 個探測器：80 / 70 各一
  },
] as const;

/* ------------------------------------------------------------------ 地區 */

/** 決定「與屯元天有關」的關鍵詞。 */
export const DISTRICT_KEYWORDS = [
  '屯門',
  '元朗',
  '天水圍',
  '朗屏',
  '兆康',
  '洪水橋',
  '青山公路',
  '大欖',
] as const;

/** 「現已解封」之類的好消息：唔彈窗、唔推送。 */
export const REOPENED_PATTERNS = [/已解封/, /解封/, /恢復通車/, /重開/, /現已開放/, /re-?opened/i, /cleared/i] as const;
