import './styles/base.css';
import './styles/extra.css';

import { errorMessage } from './api/client';
import { fetchBusArrivals, loadBusStops, type BusStopRef } from './api/bus';
import { fetchPortArrivals } from './api/port';
import { fetchLrtStations } from './api/lrt';
import { PartialFailureError, TML_CODES, fetchTmlBatch } from './api/mtr';
import { fetchTrafficNews } from './api/traffic';
import { idleSlice, type AlertFilter, type AppState, type ConnState, type GpsState, type Slice, type TrafficItem } from './api/types';
import { fetchRoadSpeeds } from './api/roads';
import { fetchWeather } from './api/weather';
import { SEVERITY_LABEL, roadStatuses, sortByNewest } from './core/messages';
import { nearestLrtStation, LRT_STATIONS, stationName, busStopsFor } from './core/places';
import { REFRESH_MS } from './config';
import { currentPushState, subscribePush, unsubscribePush } from './push';
import { Scheduler } from './core/scheduler';
import { createStore } from './core/store';
import { byId, on } from './lib/dom';
import { clockText } from './lib/format';
import { showAdviceDetail } from './ui/advice';
import { renderApp } from './ui/app';
import { initChrome, type Chrome, type ModalBlock } from './ui/chrome';
import { mapsUrl } from './ui/location';
import { initLrtPicker } from './ui/rail';
import { initBusPicker } from './ui/bus';
import { busIcon, railStrip, trainIcon, tramIcon } from './ui/rail-art';
import { registerServiceWorker } from './pwa';

/* ---------------------------------------------------------------- 偏好設定 */

const PREF_KEY = 'hk-traffic-v2-prefs';

interface LastFix {
  lat: number;
  lon: number;
  /** 毫秒時間戳 */
  at: number;
}

interface Prefs {
  night: boolean;
  favorites: string[];
  lrtStation: string;
  /**
   * 上次成功定位嘅座標。
   *
   * iPhone Safari 重新開網頁時唔會記得上次位置，而地理位置權限又一定要用戶手勢先問。
   * 所以我們自己記住上次座標：開頁面即刻可以顯示「上次定位」，唔需要再按掣；
   * 如果權限仍然有效，就會在背景靜靜更新。
   */
  lastFix: LastFix | null;
}

const DEFAULT_LRT_STATION = '500';

/** 舊版存的是站名（天榮），新版存站號（500）；讀取時自動換算。 */
function migrateStation(value: string): string {
  if (LRT_STATIONS.some((station) => station.code === value)) return value;
  const byName = LRT_STATIONS.find((station) => station.name === value);
  return byName?.code ?? DEFAULT_LRT_STATION;
}

function readLastFix(record: Record<string, unknown>): LastFix | null {
  const raw = record['lastFix'];
  if (typeof raw !== 'object' || raw === null) return null;
  const fix = raw as Record<string, unknown>;
  const lat = fix['lat'];
  const lon = fix['lon'];
  const at = fix['at'];
  if (typeof lat !== 'number' || typeof lon !== 'number' || typeof at !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // 超過 24 小時當作過期，避免用很久以前的座標誤導。
  if (Date.now() - at > 24 * 60 * 60 * 1000) return null;
  return { lat, lon, at };
}

function emptyPrefs(): Prefs {
  return { night: false, favorites: [], lrtStation: DEFAULT_LRT_STATION, lastFix: null };
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return emptyPrefs();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyPrefs();
    const record = parsed as Record<string, unknown>;
    const favorites = Array.isArray(record['favorites'])
      ? record['favorites'].filter((code): code is string => typeof code === 'string')
      : [];
    return {
      night: record['night'] === true,
      favorites,
      lrtStation: migrateStation(typeof record['lrtStation'] === 'string' ? record['lrtStation'] : DEFAULT_LRT_STATION),
      lastFix: readLastFix(record),
    };
  } catch {
    return emptyPrefs();
  }
}

/** 只有真正有座標（ok 或 cached）才寫入 lastFix。 */
function lastFixOf(gps: GpsState): LastFix | null {
  if (gps.lat === null || gps.lon === null) return null;
  return { lat: gps.lat, lon: gps.lon, at: (gps.at ?? new Date()).getTime() };
}
function savePrefs(state: AppState): void {
  try {
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({ night: state.ui.night, favorites: state.ui.favorites, lrtStation: state.ui.lrtStation, lastFix: lastFixOf(state.gps) }),
    );
  } catch {
    /* 私密模式可能不允許寫入，忽略即可 */
  }
}

/* ---------------------------------------------------------------- 狀態 */

const prefs = loadPrefs();

const store = createStore<AppState>({
  conn: 'loading',
  tml: idleSlice(),
  lrt: idleSlice(),
  bus: idleSlice(),
  port: idleSlice(),
  roads: idleSlice(),
  weather: idleSlice(),
  traffic: idleSlice(),
  gps: prefs.lastFix
    ? {
        status: 'cached',
        lat: prefs.lastFix.lat,
        lon: prefs.lastFix.lon,
        accuracyM: null,
        at: new Date(prefs.lastFix.at),
      }
    : { status: 'idle', lat: null, lon: null, accuracyM: null, at: null },
  ui: { night: prefs.night, filter: 'all', favorites: prefs.favorites, lrtStation: prefs.lrtStation, busStop: 'auto' },
});

let chrome: Chrome | null = null;
let scheduler: Scheduler | null = null;

const seenTrafficIds = new Set<string>();
let firstTrafficLoad = true;

/* ---------------------------------------------------------------- slice 工具 */

function beginLoad<T>(slice: Slice<T>): Slice<T> {
  if (slice.data) return { ...slice, error: null };
  return { ...slice, state: 'loading', error: null };
}

function succeed<T>(data: T, fetchMs: number): Slice<T> {
  return { state: 'ok', data, updatedAt: new Date(), error: null, fetchMs };
}

function failed<T>(slice: Slice<T>, message: string): Slice<T> {
  return { ...slice, state: 'error', error: message };
}

/* ---------------------------------------------------------------- 通知 */

function notify(item: TrafficItem): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(`香港交通警報中心｜${SEVERITY_LABEL[item.severity]}`, {
      body: `${item.location ? `${item.location}：` : ''}${item.content}`,
      tag: item.id,
    });
  } catch {
    /* 部分平台（例如未安裝的 iOS Safari）會拋錯，忽略 */
  }
}

function surfaceAlert(item: TrafficItem): void {
  chrome?.popup({
    title: `${SEVERITY_LABEL[item.severity]}｜${item.heading}`,
    detail: `${item.location ? `${item.location}：` : ''}${item.content}`,
    time: item.announcedAt ? clockText(item.announcedAt) : '剛剛',
    severity: item.severity,
  });
  notify(item);
}

/* ---------------------------------------------------------------- 動作 */

function requestGps(silent = false): void {
  if (!('geolocation' in navigator)) {
    store.update({ gps: { status: 'unsupported', lat: null, lon: null, accuracyM: null, at: null } });
    chrome?.toast('此裝置不支援定位');
    return;
  }

  const current = store.get().gps;
  store.update({ gps: { ...current, status: 'locating' } });

  navigator.geolocation.getCurrentPosition(
    (position) => {
      store.update({
        gps: {
          status: 'ok',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          at: new Date(),
        },
      });
      scheduler?.refresh('weather');

      // 用真實座標切換到最近的輕鐵站（同時帶動巴士面板）。
      const nearest = nearestLrtStation({ lat: position.coords.latitude, lon: position.coords.longitude });
      if (nearest.km < 3) selectLrtStation(nearest.station.code, true);

      chrome?.toast('已定位', `±${Math.round(position.coords.accuracy)} 米`);
    },
    (error) => {
      if (silent) return;
      store.update({ gps: { status: 'denied', lat: null, lon: null, accuracyM: null, at: null } });
      chrome?.toast('定位失敗', error.message);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
  );
}


/**
 * 靜靜更新定位。
 *
 * 只在「權限已係 granted」時才呼叫：iOS Safari 未授權時，程式化定位會彈提示框，
 * 每次開頁面都彈一次好騷擾，所以寧願保留上次座標，等用戶自己按掣。
 */
function maybeSilentRefresh(): void {
  const permissions = navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') return;
  permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((status) => {
      if (status.state === 'granted') requestGps(true);
    })
    .catch(() => {
      /* 舊版 Safari 唔支援查詢 geolocation 權限，忽略即可 */
    });
}
function setNight(value: boolean): void {
  const state = store.get();
  store.update({ ui: { ...state.ui, night: value } });
  savePrefs(store.get());
  chrome?.setNight(value);
}

/**
 * 通知按鈕：三個狀態。
 * 1. 伺服器已設定 VAPID → 真正 Web Push（關掉頁面都收到）
 * 2. 伺服器未設定 → 退回「頁面開啟時的桌面通知」，並講清楚限制
 * 3. 已封鎖 → 提示去瀏覽器設定
 */
async function togglePush(): Promise<void> {
  const state = await currentPushState();

  if (state === 'unsupported') {
    chrome?.toast('此裝置不支援推送', 'iOS 需要先「加到主畫面」');
    return;
  }
  if (state === 'denied') {
    chrome?.setNotify('blocked');
    chrome?.toast('通知已被封鎖', '請在瀏覽器網站設定重新允許');
    return;
  }

  if (state === 'unconfigured') {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    chrome?.setNotify(granted ? 'on' : 'off');
    chrome?.toast(
      granted ? '已開啟頁面通知' : '未開啟通知',
      granted ? '伺服器未設定推送，只會在此頁開啟時通知' : '可在瀏覽器網站設定重新允許',
    );
    return;
  }

  if (state === 'subscribed') {
    await unsubscribePush();
    chrome?.setNotify('off');
    chrome?.toast('已關閉推送', '唔會再收到背景通知');
    return;
  }

  let next: Awaited<ReturnType<typeof subscribePush>>;
  try {
    next = await subscribePush();
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[push] 訂閱失敗', error);
    chrome?.setNotify('off');
    chrome?.toast('推送訂閱失敗', detail);
    return;
  }
  chrome?.setNotify(next === 'subscribed' ? 'on' : 'off');
  chrome?.toast(
    next === 'subscribed' ? '已開啟交通推送' : '未能開啟推送',
    next === 'subscribed' ? '有新交通消息會推送到此裝置' : '請檢查通知權限',
  );
}

function toggleFavorite(code: string): void {
  const state = store.get();
  const has = state.ui.favorites.includes(code);
  const favorites = has ? state.ui.favorites.filter((item) => item !== code) : [...state.ui.favorites, code];
  store.update({ ui: { ...state.ui, favorites } });
  savePrefs(store.get());
}

const FILTER_ORDER: readonly AlertFilter[] = ['all', 'latest', 'severe'];

function selectLrtStation(code: string, announce = false): void {
  const state = store.get();
  if (state.ui.lrtStation === code) return;
  // 巴士面板跟隨選中嘅站，所以要清掉舊站資料，避免短暫顯示錯站班次。
  const resetBus = state.ui.busStop === 'auto';
  store.update({ ui: { ...state.ui, lrtStation: code }, lrt: idleSlice(), ...(resetBus ? { bus: idleSlice() } : {}) });
  savePrefs(store.get());
  scheduler?.refresh('lrt');
  if (resetBus) scheduler?.refresh('bus');
  if (announce) chrome?.toast('已切換車站', `${stationName(code)}站（巴士同步更新）`);
}

function selectBusStop(id: string): void {
  const state = store.get();
  if (state.ui.busStop === id) return;
  store.update({ ui: { ...state.ui, busStop: id }, bus: idleSlice() });
  scheduler?.refresh('bus');
}
function cycleFilter(): void {
  const state = store.get();
  const index = FILTER_ORDER.indexOf(state.ui.filter);
  const next = FILTER_ORDER[(index + 1) % FILTER_ORDER.length];
  if (!next) return;
  store.update({ ui: { ...state.ui, filter: next } });
  chrome?.toast('篩選', next === 'all' ? '顯示全部' : next === 'latest' ? '只顯示最近一宗' : '只顯示事故／受阻');
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function openMap(): void {
  window.open(mapsUrl(store.get().gps), '_blank', 'noopener');
}

function showAllAlerts(): void {
  const items = store.get().traffic.data ?? [];
  const lines = sortByNewest(items)
    .slice(0, 10)
    .map(
      (item) =>
        `${clockText(item.announcedAt ?? new Date())}｜${SEVERITY_LABEL[item.severity]}｜${item.location || '地點不詳'}｜${truncate(item.content || item.detail, 90)}`,
    );
  chrome?.modal('全部交通消息', lines.length > 0 ? [{ kind: 'list', label: `共 ${items.length} 則`, items: lines }] : [{ kind: 'text', text: '目前沒有交通消息。' }]);
}

function showRoadDetail(): void {
  const items = store.get().traffic.data ?? [];
  const blocks: ModalBlock[] = roadStatuses(items).map((status) => ({
    kind: 'row',
    label: status.road.name,
    value:
      status.count === 0
        ? '無相關消息'
        : `${status.count} 則${status.closed ? '（有受阻）' : ''}・最近 ${status.latest?.announcedAt ? clockText(status.latest.announcedAt) : '--'}`,
  }));
  blocks.push({
    kind: 'text',
    text: '比對方式：用運輸署消息的標題、內容、地點比對路名。所以「無相關消息」只代表消息流裡沒提到，唔等於路面暢順。',
  });
  chrome?.modal('道路比對詳情', blocks);
}

/* ---------------------------------------------------------------- 連線狀態 */

function computeConn(state: AppState): ConnState {
  if (!navigator.onLine) return 'offline';
  const slices = [state.tml, state.lrt, state.bus, state.roads, state.weather, state.traffic];
  if (slices.every((slice) => slice.state === 'idle' || slice.state === 'loading')) return 'loading';
  const errors = slices.filter((slice) => slice.state === 'error').length;
  if (errors === slices.length) return 'error';
  if (errors > 0) return 'stale';
  const now = Date.now();
  const stale = slices.some((slice) => slice.updatedAt !== null && now - slice.updatedAt.getTime() > 3 * 60_000);
  return stale ? 'stale' : 'live';
}

function latestSync(state: AppState): Date | null {
  return [state.tml, state.lrt, state.bus, state.roads, state.weather, state.traffic].reduce<Date | null>((newest, slice) => {
    if (!slice.updatedAt) return newest;
    if (!newest) return slice.updatedAt;
    return slice.updatedAt > newest ? slice.updatedAt : newest;
  }, null);
}

/* ---------------------------------------------------------------- 排程 */

function startJobs(sched: Scheduler): void {
  sched.add({
    name: 'tml',
    everyMs: REFRESH_MS.tml,
    async run(signal) {
      store.update({ tml: beginLoad(store.get().tml) });
      const started = performance.now();
      try {
        const map = await fetchTmlBatch(TML_CODES, { signal });
        const record: Partial<Record<string, import('./api/types').StationArrivals>> = {};
        for (const [code, value] of map) record[code] = value;
        store.update({ tml: succeed(record, performance.now() - started) });
      } catch (error) {
        if (error instanceof PartialFailureError) {
          const record: Partial<Record<string, import('./api/types').StationArrivals>> = {};
          for (const [code, value] of error.partial) record[code] = value;
          store.update({
            tml: { ...succeed(record, performance.now() - started), error: '部分車站失敗' },
          });
          return;
        }
        store.update({ tml: failed(store.get().tml, errorMessage(error)) });
      }
    },
  });

  sched.add({
    name: 'lrt',
    everyMs: REFRESH_MS.lrt,
    async run(signal) {
      store.update({ lrt: beginLoad(store.get().lrt) });
      const started = performance.now();
      try {
        const rows = await fetchLrtStations([store.get().ui.lrtStation], { signal });
        store.update({ lrt: succeed(rows, performance.now() - started) });
      } catch (error) {
        store.update({ lrt: failed(store.get().lrt, errorMessage(error)) });
      }
    },
  });

  sched.add({
    name: 'bus',
    everyMs: REFRESH_MS.bus,
    async run(signal) {
      const state = store.get();
      const chosen = state.ui.busStop;
      let stops: readonly BusStopRef[];
      if (chosen === 'auto') {
        stops = busStopsFor(state.ui.lrtStation);
      } else {
        const list = await loadBusStops({ signal });
        const hit = list.find((stop) => stop.id === chosen);
        stops = hit ? [{ id: hit.id, name: hit.name }] : [];
      }
      store.update({ bus: beginLoad(store.get().bus) });
      const started = performance.now();
      try {
        const rows = await fetchBusArrivals(stops, new Date(), { signal });
        store.update({ bus: succeed(rows, performance.now() - started) });
      } catch (error) {
        store.update({ bus: failed(store.get().bus, errorMessage(error)) });
      }
    },
  });

  sched.add({
    name: 'port',
    everyMs: 60_000,
    async run(signal) {
      store.update({ port: beginLoad(store.get().port) });
      const started = performance.now();
      try {
        const rows = await fetchPortArrivals(new Date(), { signal });
        store.update({ port: succeed(rows, performance.now() - started) });
      } catch (error) {
        store.update({ port: failed(store.get().port, errorMessage(error)) });
      }
    },
  });
  sched.add({
    name: 'roads',
    everyMs: REFRESH_MS.roads,
    async run(signal) {
      store.update({ roads: beginLoad(store.get().roads) });
      const started = performance.now();
      try {
        const snapshot = await fetchRoadSpeeds({ signal });
        store.update({ roads: succeed(snapshot, performance.now() - started) });
      } catch (error) {
        store.update({ roads: failed(store.get().roads, errorMessage(error)) });
      }
    },
  });

  sched.add({
    name: 'traffic',
    everyMs: REFRESH_MS.traffic,
    async run(signal) {
      store.update({ traffic: beginLoad(store.get().traffic) });
      const started = performance.now();
      try {
        const items = await fetchTrafficNews({ signal });
        store.update({ traffic: succeed(items, performance.now() - started) });

        const fresh = items.filter((item) => !seenTrafficIds.has(item.id));
        for (const item of items) seenTrafficIds.add(item.id);

        if (firstTrafficLoad) {
          firstTrafficLoad = false;
          return;
        }

        const alertable = sortByNewest(fresh.filter((item) => item.msgState !== 'reopened' && item.severity !== 'notice'));
        const top = alertable[0];
        if (top) surfaceAlert(top);
      } catch (error) {
        store.update({ traffic: failed(store.get().traffic, errorMessage(error)) });
      }
    },
  });

  sched.add({
    name: 'weather',
    everyMs: REFRESH_MS.weather,
    async run(signal) {
      store.update({ weather: beginLoad(store.get().weather) });
      const started = performance.now();
      try {
        const gps = store.get().gps;
        const coords = gps.lat !== null && gps.lon !== null ? { lat: gps.lat, lon: gps.lon } : null;
        const reading = await fetchWeather(coords, { signal });
        store.update({ weather: succeed(reading, performance.now() - started) });
      } catch (error) {
        store.update({ weather: failed(store.get().weather, errorMessage(error)) });
      }
    },
  });
}

/* ---------------------------------------------------------------- 綁定 */

function bindActions(): void {
  on(byId('advice-detail-btn'), 'click', () => {
    if (chrome) showAdviceDetail(chrome);
  });
  on(byId('all-alerts-btn'), 'click', showAllAlerts);
  on(byId('alert-filter'), 'click', cycleFilter);
  on(byId('road-detail-btn'), 'click', showRoadDetail);
  on(byId('map-open-btn'), 'click', openMap);

  on(byId('header-warning'), 'click', () => {
    const reading = store.get().weather.data;
    if (!reading?.warning) return;
    chrome?.modal('天氣警告', [
      { kind: 'row', label: '生效中警告', value: reading.warning },
      { kind: 'row', label: '觀測站', value: reading.station },
      { kind: 'row', label: '觀測時間', value: reading.observedAt ? clockText(reading.observedAt) : '不詳' },
      { kind: 'text', text: '資料來自香港天文台 rhrread，只有警告標題，未包含生效時間同細則。' },
    ]);
  });

  // 站牌由 JS 動態產生，所以用事件委派（唔可以喺啟動時逐個綁）。
  on(byId('tml-stack'), 'click', (event) => {
    const target = event.target;
    const row = target instanceof Element ? target.closest('.station-row') : null;
    const code = row instanceof HTMLElement ? row.dataset['code'] : undefined;
    if (!code) return;
    scheduler?.refresh('tml');
    chrome?.toast('屯馬綫', `已要求重新整理 ${code}`);
  });
}

/* ---------------------------------------------------------------- 啟動 */

const activeScheduler = new Scheduler();
scheduler = activeScheduler;
startJobs(activeScheduler);

chrome = initChrome({ onNight: setNight, onNotify: () => void togglePush(), onGps: requestGps });

// 動感圖示只在啟動時掛一次，避免每 30 秒重繪時動畫由頭跳一次。
byId('tml-art').append(trainIcon());
byId('lrt-art').append(tramIcon());
byId('bus-art').append(busIcon());
byId('tml-strip').append(railStrip());

bindActions();
initLrtPicker({ selectLrtStation });
initBusPicker({ selectBusStop });
chrome.setNight(prefs.night);

// 位置：上次座標會即刻顯示；若權限仍有效，背景靜靜更新（唔會彈提示）。
const fixAge = prefs.lastFix ? Date.now() - prefs.lastFix.at : Number.POSITIVE_INFINITY;
if (fixAge > 5 * 60_000) window.setTimeout(maybeSilentRefresh, 1200);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const at = store.get().gps.at?.getTime() ?? 0;
  if (Date.now() - at > 5 * 60_000) maybeSilentRefresh();
});

on(byId('gps-panel-btn'), 'click', () => requestGps());

void currentPushState().then((state) => {
  chrome?.setNotify(state === 'subscribed' ? 'on' : state === 'denied' ? 'blocked' : 'off');
});

const appHandlers = {
  favorites: {
    toggle: toggleFavorite,
    refresh: () => {
      scheduler?.refresh('tml');
      chrome?.toast('到站', '已要求重新整理');
    },
  },
  rail: {
    selectLrtStation,
  },
};

store.subscribe((state) => {
  renderApp(state, appHandlers);

  const conn = computeConn(state);
  if (conn !== state.conn) {
    store.update({ conn });
    return;
  }

  chrome?.setConn(state.conn);
  const latest = latestSync(state);
  chrome?.setFooter(latest ? `最後同步 ${clockText(latest)}` : '尚未同步');
  byId('last-sync').textContent = latest ? `最後同步 ${clockText(latest)}` : '尚未同步';
});

activeScheduler.start();
registerServiceWorker(() => chrome?.toast('有新版本', '重新載入即可套用'));
