import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import {
  createResetFunction,
  createSetStateFunction
} from '$lib/features/commons/utils/store.utils';
import type { LegendItem, LegendState } from './legend.types';

const DEFAULT_LEGEND_STATE: LegendState = {
  items: [
    {
      id: 'legend-1',
      name: 'Population',
      visible: true,
      title: 'Population par région',
      subtitle: "En milliers d'habitants",
      note: 'Données 2023'
    },
    {
      id: 'legend-2',
      name: 'PIB',
      visible: true,
      title: 'PIB par habitant',
      subtitle: 'En euros',
      note: 'Source: INSEE'
    }
  ],
  position: LegendPosition.TOP_RIGHT,
  visible: true,
  style: {
    fontFamily: 'Cabin',
    fontSize: 12,
    background: {
      enabled: true,
      color: { hue: 180, saturation: 50, lightness: 50 },
      opacity: 100
    }
  },
  activeTab: LegendTab.CONTENT
};

export const legendState = $state<LegendState>({ ...DEFAULT_LEGEND_STATE });

export function getLegendState(): LegendState {
  return legendState;
}

export const legendActions = {
  setState: createSetStateFunction(legendState),

  addLegendItem(item: Omit<LegendItem, 'id'>): LegendItem {
    const newItem: LegendItem = {
      ...item,
      id: `legend-${Date.now()}`
    };

    legendState.items = [...legendState.items, newItem];
    return newItem;
  },

  removeLegendItem(id: string): void {
    legendState.items = legendState.items.filter((item) => item.id !== id);
  },

  updateLegendItem(id: string, updates: Partial<LegendItem>): void {
    legendState.items = legendState.items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
  },

  toggleLegendVisibility(): void {
    legendState.visible = !legendState.visible;
  },

  setPosition(position: LegendPosition): void {
    legendState.position = position;
  },

  setActiveTab(tab: LegendTab): void {
    legendState.activeTab = tab;
  },

  reset: createResetFunction(legendState, DEFAULT_LEGEND_STATE)
};
