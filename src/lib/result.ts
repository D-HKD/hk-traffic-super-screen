/** 明確的成功／失敗型別，避免用 throw 表達可預期的資料問題。 */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (error: string): Result<never> => ({ ok: false, error });

export function isOk<T>(r: Result<T>): r is { readonly ok: true; readonly value: T } {
  return r.ok;
}
