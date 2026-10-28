/**
 * 香港天文台的 `warningMessage` 有時係字串、有時係字串陣列
 * （有警告生效時就變陣列）。舊版只接受字串，結果「有警告」嗰日整個天氣解析失敗，
 * 正好是最需要顯示天氣的時候——2026-10-28 強烈季候風信號當日就中過。
 *
 * 這裡兩種都接受；陣列用換行連接，其餘型別當作「冇警告」，唔會拋錯。
 */
export function textOrJoined(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return parts.length > 0 ? parts.join('\n') : null;
  }
  return null;
}