import type { AppState } from '../api/types';
import { renderAdvice } from './advice';
import { renderBus, renderPort } from './bus';
import { renderFavorites, type FavoritesHandlers } from './misc';
import { renderLocation } from './location';
import { renderMessages, renderRelevant, renderRoads } from './roads';
import { renderRail, type RailHandlers } from './rail';
import { renderSources } from './sources';
import { renderWeather } from './weather';

export interface AppHandlers {
  readonly favorites: FavoritesHandlers;
  readonly rail: RailHandlers;
}

/**
 * 一次過重繪所有面板。
 *
 * store 只在有改動時通知，而且每個 slice 都是獨立 reference，
 * 所以「只改 GPS」不會令到站面板白白重建。
 */
export function renderApp(state: AppState, handlers: AppHandlers): void {
  const now = new Date();
  renderAdvice(state);
  renderRail(state, now, handlers.rail);
  renderBus(state, now);
  renderPort(state);
  renderWeather(state.weather, now);
  renderRoads(state.traffic, state.roads, now);
  renderMessages(state.traffic, state.ui.filter);
  renderRelevant(state.traffic, state.ui.filter);
  renderLocation(state.gps);
  renderSources(state, now);
  renderFavorites(state, handlers.favorites);
}
