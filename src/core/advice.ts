/**
 * 出行建議：明確的規則引擎，唔扮 AI。
 *
 * 舊版叫「AI 出行建議」，實際上是 `if (/嚴重|封路/.test(text))`，
 * 而且只睇第一條消息、唔理新舊、唔理天氣警告。這裡把輸入攤開成明確條件，
 * 同時把「為什麼得出這個結論」一併輸出，UI 可以直接顯示推算依據。
 */

export type AdviceLevel = 'good' | 'warn' | 'bad';

export interface AdviceInput {
  /** 屯元天相關消息中最嚴重的一級。 */
  readonly worstSeverity: 'closure' | 'incident' | 'notice' | null;
  /** 未解封的封閉／事故消息數目。 */
  readonly activeCount: number;
  /** 已解封消息數目（好消息，不應觸發警告）。 */
  readonly reopenedCount: number;
  readonly tempC: number | null;
  readonly warning: string | null;
  /** 鐵路資料是否失敗。 */
  readonly railFailed: boolean;
  /** 最近一班車的分鐘數（用於提醒預留時間）。 */
  readonly nextTrainMinutes: number | null;
}

export interface Advice {
  readonly level: AdviceLevel;
  readonly title: string;
  readonly text: string;
  readonly reasons: readonly string[];
}

const HOT_C = 33;

export function computeAdvice(input: AdviceInput): Advice {
  const reasons: string[] = [];

  if (input.activeCount > 0 && input.worstSeverity === 'closure') {
    reasons.push(`有 ${input.activeCount} 宗未解封的道路受阻消息`);
    if (input.railFailed) reasons.push('鐵路資料暫時取不到，未能確認替代路線');
    return {
      level: 'bad',
      title: '建議：先查清楚再出門',
      text: '屯元天範圍有道路受阻消息；如果必須出門，先睇下面消息詳情，並考慮改乘鐵路。',
      reasons,
    };
  }

  if (input.activeCount > 0 && input.worstSeverity === 'incident') {
    reasons.push(`有 ${input.activeCount} 宗交通事故或擠塞消息`);
    if (input.nextTrainMinutes !== null && input.nextTrainMinutes <= 3) {
      reasons.push(`最近一班屯馬綫 ${input.nextTrainMinutes} 分鐘內到站`);
    }
    return {
      level: 'warn',
      title: '建議：可以出門，預留多一點時間',
      text: '有交通事故事件，行車時間可能比平時長；趕時間可以考慮屯馬綫或輕鐵。',
      reasons,
    };
  }

  if (input.warning) {
    reasons.push(`天文台有警告：${input.warning}`);
    return {
      level: 'warn',
      title: '建議：留意天氣警告',
      text: '目前有生效中的天氣警告，路面情況可能隨時變化。',
      reasons,
    };
  }

  if (input.tempC !== null && input.tempC >= HOT_C) {
    reasons.push(`氣溫 ${input.tempC}°C，達到高溫提醒門檻 ${HOT_C}°C`);
    return {
      level: 'warn',
      title: '建議：高溫，注意補充水分',
      text: `目前氣溫 ${input.tempC}°C，等車或步行時間長的話要特別注意。`,
      reasons,
    };
  }

  if (input.railFailed) {
    reasons.push('鐵路到站資料暫時取不到');
    return {
      level: 'warn',
      title: '建議：鐵路資料未能確認',
      text: '道路方面未見特別消息，但鐵路資料暫時取不到，出門前可再刷新一次。',
      reasons,
    };
  }

  if (input.activeCount === 0) {
    reasons.push('屯元天範圍暫無未解封的交通消息');
    if (input.reopenedCount > 0) reasons.push(`有 ${input.reopenedCount} 宗已解封（好消息）`);
    if (input.tempC !== null) reasons.push(`氣溫 ${input.tempC}°C`);
    return {
      level: 'good',
      title: '建議：可以出門',
      text: '目前未見影響屯元天的交通消息，天氣亦無特別警告。',
      reasons,
    };
  }

  reasons.push(`有 ${input.activeCount} 宗一般交通消息`);
  return {
    level: 'good',
    title: '建議：可以出門',
    text: '有交通消息但未見直接影響，出發前可再睇一次詳情。',
    reasons,
  };
}
