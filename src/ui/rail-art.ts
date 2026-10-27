import { h } from '../lib/dom';
import { svgEl } from '../lib/svg';

/**
 * 動感圖示。動畫本身只係裝飾，所以全部 `aria-hidden`，
 * 並且在 `prefers-reduced-motion` 之下由 CSS 完全停掉。
 *
 * 注意：全部係靜態幾何，唔含任何資料，所以可以安全地只建立一次並長期留在 DOM，
 * 避免每 30 秒重繪時動畫由頭跳一次。
 */

/** 輕鐵：車身 + 車窗 + 集電弓 + 車輪，車頭燈會呼吸。 */
export function tramIcon(): SVGSVGElement {
  return svgEl(
    'svg',
    { viewBox: '0 0 40 40', width: '32', height: '32', class: 'art art-tram', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('rect', { x: '7', y: '9', width: '26', height: '20', rx: '5', class: 'tram-body' }),
    svgEl('rect', { x: '10.5', y: '13', width: '8', height: '7', rx: '1.6', class: 'tram-window' }),
    svgEl('rect', { x: '21.5', y: '13', width: '8', height: '7', rx: '1.6', class: 'tram-window' }),
    svgEl('rect', { x: '10.5', y: '22.5', width: '19', height: '2', rx: '1', class: 'tram-stripe' }),
    svgEl('circle', { cx: '13.5', cy: '30.5', r: '2.4', class: 'tram-wheel' }),
    svgEl('circle', { cx: '26.5', cy: '30.5', r: '2.4', class: 'tram-wheel' }),
    svgEl('path', { d: 'M20 9 L20 5.5 M15.5 5.5 L24.5 5.5', class: 'tram-pantograph' }),
    svgEl('circle', { cx: '31.5', cy: '18', r: '1.9', class: 'tram-light' }),
  );
}

/** 屯馬綫：列車頭 + 兩條燈帶，燈帶會流動（代表「有車行緊」）。 */
export function trainIcon(): SVGSVGElement {
  return svgEl(
    'svg',
    { viewBox: '0 0 40 40', width: '32', height: '32', class: 'art art-train', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('path', { d: 'M11 8 h18 a5 5 0 0 1 5 5 v13 a5 5 0 0 1 -5 5 h-18 a5 5 0 0 1 -5 -5 v-13 a5 5 0 0 1 5 -5 z', class: 'train-body' }),
    svgEl('rect', { x: '9', y: '11.5', width: '8', height: '8.5', rx: '1.8', class: 'train-window' }),
    svgEl('rect', { x: '23', y: '11.5', width: '8', height: '8.5', rx: '1.8', class: 'train-window' }),
    svgEl('rect', { x: '10', y: '23.5', width: '20', height: '2', rx: '1', class: 'train-band' }),
    svgEl('circle', { cx: '20', cy: '30', r: '6', class: 'train-glow' }),
    svgEl('rect', { x: '13', y: '31', width: '14', height: '2.4', rx: '1.2', class: 'train-head' }),
  );
}

/**
 * 巴士圖示（側面）：同輕鐵／屯馬綫同一套線條風格，只係換成黃色作識別。
 */
export function busIcon(): SVGSVGElement {
  return svgEl(
    'svg',
    { viewBox: '0 0 40 40', width: '32', height: '32', class: 'art art-bus', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('rect', { x: '5', y: '10', width: '30', height: '18', rx: '4', class: 'bus-body' }),
    svgEl('rect', { x: '8', y: '13.5', width: '7', height: '6', rx: '1.2', class: 'bus-window' }),
    svgEl('rect', { x: '17', y: '13.5', width: '7', height: '6', rx: '1.2', class: 'bus-window' }),
    svgEl('rect', { x: '26', y: '13.5', width: '6', height: '6', rx: '1.2', class: 'bus-window' }),
    svgEl('rect', { x: '8', y: '22', width: '24', height: '2', rx: '1', class: 'bus-stripe' }),
    svgEl('circle', { cx: '12.5', cy: '29', r: '2.6', class: 'bus-wheel' }),
    svgEl('circle', { cx: '27.5', cy: '29', r: '2.6', class: 'bus-wheel' }),
  );
}
/**
 * 屯馬綫迷你路綫圖：三個站點 + 一粒光由左行到右。
 * 純 CSS 動畫（left 由 4% 到 96%），唔需要 JS。
 */
export function railStrip(): HTMLElement {
  const strip = h('div', { class: 'rail-strip', aria: { hidden: 'true' } });
  strip.append(
    h('span', { class: 'rail-track' }),
    h('span', { class: 'rail-dot', style: 'left:6%' }),
    h('span', { class: 'rail-dot', style: 'left:50%' }),
    h('span', { class: 'rail-dot', style: 'left:94%' }),
    h('span', { class: 'rail-glow' }),
    h('span', { class: 'rail-capsule' }),
  );
  return strip;
}

/**
 * 輕鐵單卡／雙卡小圖示：一卡 = 一個車身，雙卡 = 兩個車身中間有車鈎。
 * 車身用淺色、車頂用該路線的色相，令它在深色面板上易認（同用戶提供的參考圖一致的概念）。
 * 數值來自官方 train_length，缺失時 caller 唔會呼叫此函式。
 */
export function lrtCarsIcon(cars: 1 | 2, hue: number): SVGSVGElement {
  const carW = 19;
  const gap = 4;
  const width = cars === 2 ? carW * 2 + gap + 2 : carW + 2;
  const height = 18;
  const label = cars === 2 ? '雙卡列車' : '單卡列車';

  const root = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    class: 'art-cars',
    role: 'img',
    'aria-label': label,
    'shape-rendering': 'geometricPrecision',
  });
  root.appendChild(svgEl('title', {}, label));

  const band = `hsl(${hue} 85% 62%)`;
  const bandDark = `hsl(${hue} 80% 46%)`;

  /** 一節車廂：車頭（左）有一塊較大的駕駛室窗，之後兩塊客窗。 */
  const car = (x: number, isLead: boolean): void => {
    const top = 2.2;
    const bodyH = 11.4;
    const r = 2.6;

    // 車身（車頭圓角大一點，做出「車頭」感覺）
    root.append(
      svgEl('rect', {
        x: String(x),
        y: String(top),
        width: String(carW),
        height: String(bodyH),
        rx: String(r),
        fill: '#e8f0f8',
      }),
      // 車頂色帶
      svgEl('rect', { x: String(x + 0.9), y: String(top + 1.1), width: String(carW - 1.8), height: '2.1', rx: '1', fill: band }),
      // 車底陰影
      svgEl('rect', { x: String(x + 1.1), y: String(top + bodyH - 1.5), width: String(carW - 2.2), height: '1.2', rx: '0.6', fill: bandDark, opacity: '0.55' }),
    );

    const winY = top + 4.4;
    const winH = 4.2;

    if (isLead) {
      // 駕駛室窗（斜角車頭）
      root.append(
        svgEl('path', {
          d: `M ${x + 1.4} ${winY + 0.6} L ${x + 5.2} ${winY} L ${x + 5.2} ${winY + winH} L ${x + 1.4} ${winY + winH} Z`,
          fill: '#26445c',
        }),
      );
    }
    for (let i = 0; i < 2; i += 1) {
      root.append(
        svgEl('rect', {
          x: String(x + (isLead ? 6.6 : 1.6) + i * 5.2),
          y: String(winY),
          width: '3.8',
          height: String(winH),
          rx: '0.8',
          fill: '#26445c',
        }),
      );
    }
  };

  car(1, true);
  if (cars === 2) {
    car(1 + carW + gap, false);
    // 車鈎
    root.append(svgEl('rect', { x: String(carW + 1), y: '7.4', width: String(gap - 1), height: '1.8', rx: '0.7', fill: '#9fb3c4' }));
  }
  return root;
}
