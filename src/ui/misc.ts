import type { AppState } from '../api/types';
import { TML_STATIONS } from '../api/mtr';
import { byId, h, replace } from '../lib/dom';

function nextArrival(state: AppState, code: string): number | null {
  const station = state.tml.data?.[code];
  if (!station) return null;
  let best: number | null = null;
  for (const arrival of [...station.up, ...station.down]) {
    if (best === null || arrival.minutes < best) best = arrival.minutes;
  }
  return best;
}

export interface FavoritesHandlers {
  toggle(code: string): void;
  refresh(): void;
}

export function renderFavorites(state: AppState, handlers: FavoritesHandlers): void {
  const favorites = state.ui.favorites;
  const ordered = [...TML_STATIONS].sort(
    (a, b) => Number(favorites.includes(b.code)) - Number(favorites.includes(a.code)),
  );

  replace(
    byId('favorites'),
    ...ordered.map((station) => {
      const minutes = nextArrival(state, station.code);
      const isFav = favorites.includes(station.code);
      return h(
        'div',
        { class: 'fav-row' },
        h('div', {}, h('b', { text: station.name }), h('small', { text: `屯馬綫 ${station.code}${isFav ? '・已收藏' : ''}` })),
        h(
          'div',
          { class: 'fav-right' },
          h('button', {
            class: 'star-btn',
            type: 'button',
            text: isFav ? '★' : '☆',
            aria: { label: isFav ? `取消收藏${station.name}` : `收藏${station.name}`, pressed: String(isFav) },
            on: { click: () => handlers.toggle(station.code) },
          }),
          h('span', {
            class: minutes === null ? 'eta-min none' : 'eta-min',
            text: minutes === null ? '--' : minutes <= 1 ? '即將' : `${minutes} 分`,
          }),
        ),
      );
    }),
    h(
      'div',
      { class: 'fav-actions' },
      h('button', { type: 'button', text: '重新整理到站', on: { click: () => handlers.refresh() } }),
    ),
  );
}
