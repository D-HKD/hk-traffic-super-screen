/** 跨層共用的資料型別。 */

export type LoadState = 'idle' | 'loading' | 'ok' | 'error';

/** 每個資料源的統一狀態：資料、更新時間、錯誤都要一齊存在，UI 才可以講真話。 */
export interface Slice<T> {
  readonly state: LoadState;
  readonly data: T | null;
  readonly updatedAt: Date | null;
  readonly error: string | null;
  readonly fetchMs: number | null;
}

export function idleSlice<T>(): Slice<T> {
  return { state: 'idle', data: null, updatedAt: null, error: null, fetchMs: null };
}

export type Direction = 'UP' | 'DOWN';

export interface Arrival {
  readonly dir: Direction;
  readonly destCode: string;
  readonly destLabel: string;
  readonly platform: string;
  readonly minutes: number;
}

export interface StationArrivals {
  readonly station: string;
  readonly name: string;
  readonly up: readonly Arrival[];
  readonly down: readonly Arrival[];
  readonly serverTime: Date | null;
}

export interface LrtRow {
  readonly route: string;
  readonly dest: string;
  readonly platform: string;
  readonly minutes: number;
  readonly station: string;
  /** 由官方 train_length 得出：1 = 單卡，2 = 雙卡；資料缺失時為 null（不顯示，不猜）。 */
  readonly cars: 1 | 2 | null;
}

export interface WeatherReading {
  readonly station: string;
  readonly tempC: number | null;
  readonly humidity: number | null;
  readonly rainMaxMm: number | null;
  readonly uvDesc: string | null;
  readonly warning: string | null;
  readonly observedAt: Date | null;
  /** 解析失敗的欄位名（例如 ['warningMessage']）；空陣列＝全部正常。 */
  readonly issues: readonly string[];
}

/** 九巴到站（一個站，已按路線＋目的地去重）。 */
export interface BusArrival {
  readonly route: string;
  readonly dest: string;
  readonly minutes: number;
  readonly stop: string;
  readonly stopId: string;
  readonly operator: string;
}

export interface RoadDirectionSpeed {
  readonly dir: string;
  readonly kmh: number;
  readonly detectors: number;
}

/** 運輸署探測器算出的即時車速（km/h）。kmh = null 代表該路冇足夠數據。 */
export interface RoadSpeed {
  readonly id: string;
  readonly name: string;
  readonly kmh: number | null;
  readonly detectors: number;
  /** 按方向分開（東行／西行／南行／北行），最慢排第一。 */
  readonly dirs: readonly RoadDirectionSpeed[];
}

export interface RoadSnapshot {
  readonly period: string | null;
  readonly roads: readonly RoadSpeed[];
}

export type Severity = 'closure' | 'incident' | 'notice';
export type MessageState = 'new' | 'updated' | 'reopened' | 'other';

export interface TrafficItem {
  readonly id: string;
  readonly heading: string;
  readonly detail: string;
  readonly content: string;
  readonly location: string;
  readonly direction: string;
  readonly status: string;
  readonly announcedAt: Date | null;
  readonly severity: Severity;
  readonly msgState: MessageState;
}

export type GpsStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unsupported' | 'cached';

export interface GpsState {
  readonly status: GpsStatus;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly accuracyM: number | null;
  readonly at: Date | null;
}

export type ConnState = 'loading' | 'live' | 'stale' | 'offline' | 'error';

export type AlertFilter = 'all' | 'latest' | 'severe';

import type { MapApp } from '../ui/location.ts';

export interface UiState {
  readonly night: boolean;
  readonly filter: AlertFilter;
  readonly favorites: readonly string[];
  /** 輕鐵面板目前選中的站號（例如 500）。 */
  readonly lrtStation: string;
  /** 巴士面板：'auto' = 跟隨輕鐵站；否則係九巴站號。 */
  readonly busStop: string;
  /** 「在地圖開啟」用邊個 App。 */
  readonly mapApp: MapApp;
}

export interface PortArrival {
  readonly operator: 'NLB' | 'CTB';
  readonly route: string;
  readonly from: string;
  readonly dest: string;
  readonly minutes: number;
}

export interface AppState {
  readonly conn: ConnState;
  readonly tml: Slice<Readonly<Partial<Record<string, StationArrivals>>>>;
  readonly lrt: Slice<readonly LrtRow[]>;
  readonly bus: Slice<readonly BusArrival[]>;
  readonly port: Slice<readonly PortArrival[]>;
  readonly roads: Slice<RoadSnapshot>;
  readonly weather: Slice<WeatherReading>;
  readonly traffic: Slice<readonly TrafficItem[]>;
  readonly gps: GpsState;
  readonly ui: UiState;
}
