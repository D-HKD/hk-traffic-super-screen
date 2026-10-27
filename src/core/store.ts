/** 極簡 store：沒有框架、沒有 proxy、沒有 magic。 */

export interface Store<S> {
  get(): S;
  /** 只傳有改動的 key；未傳的 slice 保持同一個 reference，面板就可以跳過重繪。 */
  update(patch: Partial<S>): void;
  subscribe(listener: (state: S) => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<(state: S) => void>();

  return {
    get: () => state,
    update(patch) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
