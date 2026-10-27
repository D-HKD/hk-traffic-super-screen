/**
 * 最小 DOM 工具。
 *
 * 重要設計：全 app 唔用 innerHTML 拼接資料。
 * 舊版靠 esc() 轉義去防 XSS，只要漏一個位置就中；用 textContent／createElement
 * 之後，任何來自 API 的字串都冇辦法變成 HTML，呢一類 bug 從結構上消失。
 */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string | undefined;
  text?: string | undefined;
  title?: string | undefined;
  type?: 'button' | 'submit' | 'reset' | undefined;
  href?: string | undefined;
  id?: string | undefined;
  role?: string | undefined;
  value?: string | undefined;
  name?: string | undefined;
  hidden?: boolean | undefined;
  disabled?: boolean | undefined;
  style?: string | undefined;
  aria?: Readonly<Record<string, string>> | undefined;
  dataset?: Readonly<Record<string, string>> | undefined;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }> | undefined;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props.class !== undefined) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title !== undefined) el.title = props.title;
  if (props.id !== undefined) el.id = props.id;
  if (props.role !== undefined) el.setAttribute('role', props.role);
  if (props.value !== undefined) {
    if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLOptionElement) {
      el.value = props.value;
    } else {
      el.setAttribute('value', props.value);
    }
  }
  if (props.name !== undefined) el.setAttribute('name', props.name);
  if (props.type !== undefined) el.setAttribute('type', props.type);
  if (props.href !== undefined) el.setAttribute('href', props.href);
  if (props.hidden !== undefined) el.hidden = props.hidden;
  if (props.style !== undefined) el.setAttribute('style', props.style);
  if (props.disabled !== undefined && 'disabled' in el) {
    (el as HTMLButtonElement).disabled = props.disabled;
  }
  if (props.aria) for (const [k, v] of Object.entries(props.aria)) el.setAttribute(`aria-${k}`, v);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
  if (props.on) {
    for (const [type, fn] of Object.entries(props.on)) {
      if (fn) el.addEventListener(type, fn as EventListener);
    }
  }

  append(el, children);
  return el;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

export function replace(node: Element, ...children: Child[]): void {
  node.replaceChildren();
  append(node, children);
}

/** 取得必需元素；缺失就即刻爆，唔好靜靜當 null 讓畫面永遠「載入中」。 */
export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到必要元素 #${id}`);
  return el as T;
}

export function on<K extends keyof HTMLElementEventMap>(
  el: EventTarget,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
): void {
  el.addEventListener(type, handler as EventListener);
}

export function setText(el: Element, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}
