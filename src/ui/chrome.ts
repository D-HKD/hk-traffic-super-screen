import { byId, h, on, replace, setText } from '../lib/dom.ts';
import { clockText, dateText } from '../lib/format.ts';
import type { ConnState } from '../api/types.ts';

export type ModalBlock =
  | { readonly kind: 'row'; readonly label: string; readonly value: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'list'; readonly label: string; readonly items: readonly string[] };

export interface Chrome {
  toast(title: string, message?: string): void;
  modal(title: string, blocks: readonly ModalBlock[]): void;
  closeModal(): void;
  popup(input: { title: string; detail: string; time: string; severity: 'closure' | 'incident' | 'notice' }): void;
  hidePopup(): void;
  setConn(state: ConnState): void;
  setFooter(text: string): void;
  setNight(on: boolean): void;
  setNotify(kind: 'off' | 'on' | 'blocked'): void;
}

const CONN_TEXT: Readonly<Record<ConnState, string>> = {
  loading: '連線中',
  live: '即時',
  stale: '資料延遲',
  offline: '離線',
  error: '連線問題',
};

export function initChrome(handlers: { onNight(enabled: boolean): void; onNotify(): void; onGps(): void }): Chrome {
  const clockEl = byId('clock');
  const dateEl = byId('date');
  const pill = byId('conn-pill');
  const connText = byId('conn-text');
  const footer = byId('footer-status');
  const toastEl = byId('toast');
  const modalRoot = byId('modal-root');
  const popupEl = byId('alert-popup');
  const nightBtn = byId<HTMLButtonElement>('night-btn');

  const tick = (): void => {
    const now = new Date();
    setText(clockEl, clockText(now));
    setText(dateEl, dateText(now));
  };
  tick();
  window.setInterval(tick, 1000);

  // 導覽列 active 狀態：只做一次，避免舊版每按一次就重複綁定。
  const links = document.querySelectorAll<HTMLAnchorElement>('.desktop-nav a, .mobile-nav a');
  for (const link of links) {
    on(link, 'click', () => {
      for (const other of links) other.classList.remove('active');
      link.classList.add('active');
    });
  }

  let toastTimer: number | null = null;
  const toast = (title: string, message = ''): void => {
    replace(toastEl, h('b', { text: title }), message ? h('span', { text: message }) : null);
    toastEl.dataset['open'] = '1';
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.dataset['open'] = '0';
      toastTimer = null;
    }, 2800);
  };

  let modalOpen = false;
  const closeModal = (): void => {
    replace(modalRoot);
    modalOpen = false;
  };

  const modal = (title: string, blocks: readonly ModalBlock[]): void => {
    const body = h('div', { class: 'modal-body' });
    for (const block of blocks) {
      if (block.kind === 'row') {
        body.append(h('div', { class: 'mrow' }, h('span', { class: 'mk', text: block.label }), h('span', { class: 'mv', text: block.value })));
      } else if (block.kind === 'text') {
        body.append(h('p', { class: 'mrow', text: block.text }));
      } else {
        const list = h('ul', { class: 'mlist' });
        for (const item of block.items) list.append(h('li', { text: item }));
        body.append(h('div', { class: 'mrow' }, h('span', { class: 'mk', text: block.label }), list));
      }
    }

    const closeBtn = h('button', { type: 'button', text: '×', aria: { label: '關閉' }, on: { click: closeModal } });
    const backdrop = h('button', { class: 'modal-backdrop', type: 'button', aria: { label: '關閉' }, on: { click: closeModal } });
    const box = h('div', { class: 'modal-box', role: 'dialog', aria: { modal: 'true' } }, h('div', { class: 'modal-head' }, h('b', { text: title }), closeBtn), body);

    replace(modalRoot, h('div', { class: 'modal' }, backdrop, box));
    modalOpen = true;
    closeBtn.focus();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalOpen) closeModal();
  });

  let popupTimer: number | null = null;
  const hidePopup = (): void => {
    popupEl.setAttribute('aria-hidden', 'true');
    if (popupTimer !== null) window.clearTimeout(popupTimer);
    popupTimer = null;
  };

  const popup: Chrome['popup'] = (input) => {
    popupEl.className = `alert-popup ${input.severity}`;
    setText(byId('popup-icon'), input.severity === 'closure' ? '!' : input.severity === 'incident' ? '⚠' : 'i');
    setText(byId('popup-title'), input.title);
    setText(byId('popup-detail'), input.detail);
    setText(byId('popup-time'), input.time);
    popupEl.setAttribute('aria-hidden', 'false');
    if (popupTimer !== null) window.clearTimeout(popupTimer);
    popupTimer = window.setTimeout(hidePopup, 12000);
  };

  const closePopupBtn = byId<HTMLButtonElement>('popup-close');
  on(closePopupBtn, 'click', hidePopup);

  on(nightBtn, 'click', () => handlers.onNight(!document.body.classList.contains('night')));
  on(byId('notify-btn'), 'click', () => handlers.onNotify());
  on(byId('gps-btn'), 'click', () => handlers.onGps());

  return {
    toast,
    modal,
    closeModal,
    popup,
    hidePopup,
    setConn(state) {
      pill.dataset['state'] = state;
      setText(connText, CONN_TEXT[state]);
    },
    setFooter(text) {
      setText(footer, text);
    },
    setNight(value) {
      document.body.classList.toggle('night', value);
      nightBtn.setAttribute('aria-pressed', String(value));
    },
    setNotify(kind) {
      const button = byId<HTMLButtonElement>('notify-btn');
      const map = {
        off: { icon: '🔕', label: '啟用交通推送', pressed: 'false' },
        on: { icon: '🔔', label: '已開啟交通推送（點擊關閉）', pressed: 'true' },
        blocked: { icon: '🔕', label: '通知已被封鎖，請在瀏覽器設定開啟', pressed: 'false' },
      } as const;
      const state = map[kind];
      setText(button, state.icon);
      button.setAttribute('aria-label', state.label);
      button.setAttribute('title', state.label);
      button.setAttribute('aria-pressed', state.pressed);
    },
  };
}
