/**
 * Promise.allSettled 的替身。
 *
 * 三星電視（Tizen）與部分 Android TV 瀏覽器仍是 Chromium < 76，
 * 沒有 Promise.allSettled，所以這裡做一層降級，令舊機都跑得動。
 */
export function settleAll<T>(promises: readonly Promise<T>[]): Promise<readonly PromiseSettledResult<T>[]> {
  if (typeof Promise.allSettled === 'function') {
    return Promise.allSettled(promises);
  }
  return Promise.all(
    promises.map((promise) =>
      promise.then(
        (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
        (reason): PromiseSettledResult<T> => ({ status: 'rejected', reason }),
      ),
    ),
  );
}