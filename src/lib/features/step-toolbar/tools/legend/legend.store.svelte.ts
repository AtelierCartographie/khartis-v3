import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { LegendItem, LegendState, LegendStyle } from './legend.types';

const DEFAULT_STATE: LegendState = {
  items: [],
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

type LegendActions = {
  addLegendItem: (item: Omit<LegendItem, 'id'>) => LegendItem;
  removeLegendItem: (id: string) => void;
  updateLegendItem: (id: string, updates: Partial<LegendItem>) => void;
  toggleLegendVisibility: () => void;
  setPosition: (position: LegendPosition) => void;
  setActiveTab: (tab: LegendTab) => void;
  updateStyle: (updates: Partial<LegendStyle>) => void;
  updateBackground: (
    updates: Partial<LegendState['style']['background']>
  ) => void;
};

const { actions, getState } = createToolStore<LegendState, LegendActions>(
  DEFAULT_STATE,
  (s) => ({
    addLegendItem: (item: Omit<LegendItem, 'id'>): LegendItem => {
      const newItem: LegendItem = {
        ...item,
        id: `legend-${Date.now()}`
      };
      s.items = [...s.items, newItem];
      return newItem;
    },
    removeLegendItem: (id: string) => {
      s.items = s.items.filter((item) => item.id !== id);
    },
    updateLegendItem: (id: string, updates: Partial<LegendItem>) => {
      s.items = s.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );
    },
    toggleLegendVisibility: () => {
      s.visible = !s.visible;
    },
    setPosition: (position: LegendPosition) => {
      s.position = position;
    },
    setActiveTab: (tab: LegendTab) => {
      s.activeTab = tab;
    },
    updateStyle: (updates: Partial<LegendStyle>) => {
      Object.assign(s.style, updates);
    },
    updateBackground: (
      updates: Partial<LegendState['style']['background']>
    ) => {
      Object.assign(s.style.background, updates);
    }
  })
);

export const legendActions = actions;
export const getLegendState = getState;
