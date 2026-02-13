import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { LegendItem, LegendState, LegendStyle } from './legend.types';

export const DEFAULT_LEGEND_TEXT_COLOR: LegendStyle['textColor'] = {
  hue: 0,
  saturation: 0,
  lightness: 0
};

export const DEFAULT_LEGEND_BACKGROUND_COLOR: LegendStyle['background']['color'] =
  {
    hue: 0,
    saturation: 0,
    lightness: 100
  };

const DEFAULT_STATE: LegendState = {
  items: [],
  position: LegendPosition.TOP_RIGHT,
  visible: true,
  style: {
    fontFamily: 'Cabin',
    fontSize: 12,
    textColor: { ...DEFAULT_LEGEND_TEXT_COLOR },
    background: {
      enabled: true,
      color: { ...DEFAULT_LEGEND_BACKGROUND_COLOR },
      opacity: 100
    }
  },
  activeTab: LegendTab.CONTENT,
  hasBeenOpened: false
};

function normalizeOpacityValue(opacity: number): number | null {
  const rounded = Math.round(opacity);
  if (!Number.isFinite(rounded)) {
    return null;
  }
  return Math.max(0, Math.min(100, rounded));
}

type LegendActions = {
  addLegendItem: (item: Omit<LegendItem, 'id'>) => LegendItem;
  removeLegendItem: (id: string) => void;
  updateLegendItem: (id: string, updates: Partial<LegendItem>) => void;
  toggleLegendVisibility: () => void;
  setVisibility: (visible: boolean) => void;
  setPosition: (position: LegendPosition) => void;
  setActiveTab: (tab: LegendTab) => void;
  updateStyle: (updates: Partial<LegendStyle>) => void;
  updateBackground: (
    updates: Partial<LegendState['style']['background']>
  ) => void;
  markAsOpened: () => void;
  syncWithVisualizations: () => void;
};

function getLegendSubtitle(visualization: VisualizationConfig): string {
  return (
    visualization.mapping.valueColumn ??
    visualization.mapping.sizeColumn ??
    visualization.mapping.categoryColumn ??
    visualization.mapping.colorColumn ??
    ''
  );
}

function createLegendItemFromVisualization(
  visualization: VisualizationConfig
): LegendItem {
  return {
    id: `legend-viz-${visualization.id}`,
    name: visualization.name,
    visible: true,
    title: visualization.name,
    subtitle: getLegendSubtitle(visualization),
    note: '',
    variableId: visualization.id
  };
}

function syncLegendItemsWithVisualizations(
  currentItems: LegendItem[],
  visualizations: VisualizationConfig[]
): LegendItem[] {
  const usedItemIds = new Set<string>();

  const linkedItems = visualizations.map((visualization) => {
    const existing =
      currentItems.find((item) => item.variableId === visualization.id) ??
      currentItems.find(
        (item) => !item.variableId && item.name === visualization.name
      );

    if (!existing) {
      return createLegendItemFromVisualization(visualization);
    }

    usedItemIds.add(existing.id);

    const defaultSubtitle = getLegendSubtitle(visualization);
    const hasDefaultTitle = !existing.title || existing.title === existing.name;

    return {
      ...existing,
      name: visualization.name,
      title: hasDefaultTitle ? visualization.name : existing.title,
      subtitle: existing.subtitle || defaultSubtitle,
      variableId: visualization.id
    };
  });

  const customItems = currentItems.filter(
    (item) => !usedItemIds.has(item.id) && !item.variableId
  );

  return [...linkedItems, ...customItems];
}

function areLegendItemsEqual(a: LegendItem[], b: LegendItem[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const current = a[i];
    const next = b[i];
    if (
      current.id !== next.id ||
      current.name !== next.name ||
      current.visible !== next.visible ||
      current.title !== next.title ||
      current.subtitle !== next.subtitle ||
      current.note !== next.note ||
      current.variableId !== next.variableId
    ) {
      return false;
    }
  }

  return true;
}

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
    setVisibility: (visible: boolean) => {
      s.visible = visible;
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
      const normalizedUpdates = { ...updates };
      if (updates.opacity !== undefined) {
        const normalizedOpacity = normalizeOpacityValue(updates.opacity);
        if (normalizedOpacity === null) {
          delete normalizedUpdates.opacity;
        } else {
          normalizedUpdates.opacity = normalizedOpacity;
        }
      }

      Object.assign(s.style.background, normalizedUpdates);
    },
    markAsOpened: () => {
      s.hasBeenOpened = true;
    },
    syncWithVisualizations: () => {
      const syncedItems = syncLegendItemsWithVisualizations(
        s.items,
        visualizationStore.visualizations
      );

      if (!areLegendItemsEqual(s.items, syncedItems)) {
        s.items = syncedItems;
      }
    }
  })
);

export const legendActions = actions;
export const getLegendState = getState;
