import type { AppState, Severity } from '../api/types';
import { computeAdvice, type Advice } from '../core/advice';
import { byId, setText } from '../lib/dom';
import type { Chrome } from './chrome';
import { relevantItems } from './roads';

let lastAdvice: Advice | null = null;

const LEVEL_CLASS = { good: 'good', warn: 'warn', bad: 'bad' } as const;
const LEVEL_ICON = { good: '✓', warn: '!', bad: '!' } as const;

function worstSeverity(items: readonly { severity: Severity }[]): 'closure' | 'incident' | 'notice' | null {
  if (items.some((item) => item.severity === 'closure')) return 'closure';
  if (items.some((item) => item.severity === 'incident')) return 'incident';
  if (items.length > 0) return 'notice';
  return null;
}

function nextTrainMinutes(state: AppState): number | null {
  const tml = state.tml.data;
  if (!tml) return null;
  let best: number | null = null;
  for (const station of Object.values(tml)) {
    if (!station) continue;
    for (const arrival of [...station.up, ...station.down]) {
      if (best === null || arrival.minutes < best) best = arrival.minutes;
    }
  }
  return best;
}

export function renderAdvice(state: AppState): void {
  const relevant = relevantItems(state.traffic);
  const active = relevant.filter((item) => item.msgState !== 'reopened' && item.severity !== 'notice');
  const reopened = relevant.filter((item) => item.msgState === 'reopened');

  const advice = computeAdvice({
    worstSeverity: worstSeverity(active),
    activeCount: active.length,
    reopenedCount: reopened.length,
    tempC: state.weather.data?.tempC ?? null,
    warning: state.weather.data?.warning ?? null,
    railFailed: state.tml.state === 'error' || state.lrt.state === 'error',
    nextTrainMinutes: nextTrainMinutes(state),
  });
  lastAdvice = advice;

  const box = byId('advice-box');
  box.className = `advice ${LEVEL_CLASS[advice.level]}`;
  setText(byId('advice-title'), advice.title);
  setText(byId('advice-text'), advice.text);
  const icon = box.querySelector('.advice-icon');
  if (icon) setText(icon, LEVEL_ICON[advice.level]);

  const facts = byId('advice-facts');
  const parts = [
    `🚆 鐵路：${state.tml.state === 'ok' ? '已連線' : state.tml.state === 'error' ? '更新失敗' : '載入中'}`,
    `🚗 道路：${relevant.length > 0 ? `${relevant.length} 則相關消息` : state.traffic.data ? '暫無相關消息' : '載入中'}`,
    `☁️ 天氣：${state.weather.data?.tempC !== undefined && state.weather.data?.tempC !== null ? `${state.weather.data.tempC}°C` : '未取得'}`,
  ];
  facts.replaceChildren(...parts.map((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }));
}

export function showAdviceDetail(chrome: Chrome): void {
  const advice = lastAdvice;
  if (!advice) {
    chrome.modal('出行建議', [{ kind: 'text', text: '仍在等待即時資料，稍後再試。' }]);
    return;
  }
  chrome.modal('推算依據', [
    { kind: 'row', label: '結論', value: advice.title },
    { kind: 'row', label: '說明', value: advice.text },
    { kind: 'list', label: '用到的條件', items: advice.reasons.length > 0 ? advice.reasons : ['未觸發任何規則'] },
    {
      kind: 'text',
      text: '這是固定規則推算，不是機器學習模型：只看屯元天相關的未解封消息、天文台警告、氣溫同鐵路是否連線。',
    },
  ]);
}
