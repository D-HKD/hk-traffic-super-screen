import { ShapeError } from '../lib/validate';

/**
 * HTTP 層：一個地方處理逾時、abort、HTTP 錯誤碼同 JSON 解析。
 *
 * 舊版每個 endpoint 各自 fetch + 各自 catch，冇逾時、冇 abort、錯誤只 console.warn，
 * 所以「連線失敗」同「載入中」在畫面上無法區分。
 *
 * 注意：proxy 位址刻意延遲計算（唔在 module 頂層讀 import.meta.env），
 * 令呢個檔案可以在 node 測試環境被 import 而不會爆。
 */

import { APP } from '../config';

const FALLBACK_PROXY = APP.proxyBase;

let cachedBase: string | null = null;

function readEnvBase(): string {
  try {
    const value: unknown = import.meta.env.VITE_PROXY_BASE;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

export function proxyBase(): string {
  if (cachedBase === null) {
    const configured = readEnvBase();
    cachedBase = (configured !== '' ? configured : FALLBACK_PROXY).replace(/\/+$/, '');
  }
  return cachedBase;
}

export class HttpError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, url: string, status: number | null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 9000;

function buildUrl(path: string, params: Readonly<Record<string, string>>): string {
  const url = new URL(proxyBase() + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** 合併「呼叫方 signal」與「內部逾時」，任何一個 abort 都終止請求。 */
function abortable(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('請求逾時')), timeoutMs);
  const onAbort = (): void => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function request(
  path: string,
  params: Readonly<Record<string, string>>,
  options: RequestOptions,
): Promise<string> {
  const url = buildUrl(path, params);
  const { signal, dispose } = abortable(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new HttpError(`HTTP ${response.status}`, url, response.status);
    return await response.text();
  } finally {
    dispose();
  }
}

export async function getJson<T>(
  path: string,
  params: Readonly<Record<string, string>>,
  parse: (payload: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const body = await request(path, params, options);
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new HttpError('回應不是合法 JSON', buildUrl(path, params), null);
  }
  return parse(payload);
}

export async function getXml<T>(
  path: string,
  params: Readonly<Record<string, string>>,
  parse: (body: string) => T,
  options: RequestOptions = {},
): Promise<T> {
  const body = await request(path, params, options);
  try {
    return parse(body);
  } catch (error) {
    if (error instanceof ShapeError) throw error;
    throw new HttpError(`XML 解析失敗：${String((error as Error).message ?? error)}`, buildUrl(path, params), null);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof ShapeError) return `資料格式不符：${error.message}`;
  if (error instanceof DOMException && error.name === 'AbortError') return '請求逾時或被取消';
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '請求逾時或被取消';
    return error.message;
  }
  return String(error);
}
