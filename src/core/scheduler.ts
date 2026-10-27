/**
 * 單一排程器。
 *
 * 舊版有三個獨立 setInterval（10s / 60s / 60s），互相不知道對方存在：
 * 背景 tab 照跑、失敗照樣用同一節奏重試、多開一個 tab 就雙倍請求、
 * 也無法在離線時停手。這裡用一個 1 秒 tick 驅動所有 job，統一處理
 * 可見性、離線、失敗退避同 abort。
 */

export interface Job {
  readonly name: string;
  readonly everyMs: number;
  run(signal: AbortSignal): Promise<void>;
}

export interface SchedulerInfo {
  readonly busy: boolean;
  readonly paused: boolean;
  readonly online: boolean;
  readonly failingJobs: number;
}

const TICK_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60_000;

export class Scheduler {
  private readonly jobs = new Map<string, Job>();
  private readonly nextAt = new Map<string, number>();
  private readonly failures = new Map<string, number>();
  private readonly inflight = new Map<string, AbortController>();
  private readonly listeners = new Set<(info: SchedulerInfo) => void>();

  private timer: number | null = null;
  private running = false;
  private paused = false;

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOnline);
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden) this.resumeNow();
  };

  private readonly onOnline = (): void => {
    if (navigator.onLine) {
      // 重上網就即刻重試，唔需要等下一個週期。
      for (const name of this.jobs.keys()) this.nextAt.set(name, 0);
      for (const name of this.failures.keys()) this.failures.set(name, 0);
    }
    this.emit();
  };

  onChange(listener: (info: SchedulerInfo) => void): () => void {
    this.listeners.add(listener);
    listener(this.info());
    return () => this.listeners.delete(listener);
  }

  info(): SchedulerInfo {
    return {
      busy: this.inflight.size > 0,
      paused: this.paused,
      online: navigator.onLine,
      failingJobs: [...this.failures.values()].filter((n) => n > 0).length,
    };
  }

  add(job: Job): void {
    this.jobs.set(job.name, job);
    this.nextAt.set(job.name, 0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = document.hidden;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
  }

  /** 手動刷新：把某個 job 標記為立即到期。 */
  refresh(name: string): void {
    if (!this.jobs.has(name)) return;
    this.nextAt.set(name, 0);
    this.failures.set(name, 0);
    this.schedule();
  }

  /** 回到前台時，把已經過期的 job 即刻執行。 */
  private resumeNow(): void {
    this.paused = false;
    if (!this.running) return;
    const now = Date.now();
    for (const [name] of this.jobs) {
      if ((this.nextAt.get(name) ?? 0) <= now) this.nextAt.set(name, 0);
    }
    this.schedule();
  }

  private schedule(): void {
    if (!this.running) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(this.tick, TICK_MS);
  }

  private readonly tick = (): void => {
    this.timer = null;
    if (!this.running) return;

    const now = Date.now();
    const hidden = document.hidden;
    this.paused = hidden;

    if (!hidden) {
      for (const [name, job] of this.jobs) {
        if ((this.nextAt.get(name) ?? 0) > now) continue;
        if (this.inflight.has(name)) continue;
        this.launch(job);
      }
    }

    this.schedule();
  };

  private launch(job: Job): void {
    if (!navigator.onLine) {
      // 離線：唔好製造一堆註定失敗的請求，等 online event。
      this.nextAt.set(job.name, Date.now() + 5000);
      return;
    }

    const controller = new AbortController();
    this.inflight.set(job.name, controller);
    this.emit();

    job
      .run(controller.signal)
      .then(() => {
        this.failures.set(job.name, 0);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const fails = (this.failures.get(job.name) ?? 0) + 1;
        this.failures.set(job.name, fails);
        console.warn(`[scheduler] ${job.name} 失敗（第 ${fails} 次）：`, error);
      })
      .finally(() => {
        this.inflight.delete(job.name);
        const fails = this.failures.get(job.name) ?? 0;
        const backoff = Math.min(job.everyMs * 2 ** fails, MAX_BACKOFF_MS);
        this.nextAt.set(job.name, Date.now() + (fails > 0 ? backoff : job.everyMs));
        this.emit();
      });
  }

  private emit(): void {
    const info = this.info();
    for (const listener of this.listeners) listener(info);
  }
}
