/**
 * 極簡 SVG 建構器。
 * 用 createElementNS 而唔用 innerHTML，維持「資料／標記都唔會變成 HTML」的規則。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  ...children: readonly (Node | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  for (const child of children) {
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
