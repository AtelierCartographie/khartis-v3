import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { FillMode } from '$lib/features/main-toolbar/constants';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
import {
  getFormatLayoutSizingContext,
  getFormatState
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { LEGEND_DEFAULTS, LEGEND_ID_PREFIXES } from './legend.constants';
import type {
  LegendDragPosition,
  LegendItem,
  LegendState,
  LegendStyle
} from './legend.types';

type LegendTextMode = NonNullable<LegendItem['titleMode']>;

const DEFAULT_STATE: LegendState = {
  items: [],
  position: LegendPosition.TOP_RIGHT,
  dragPosition: null,
  visible: true,
  style: {
    fontFamily: LEGEND_DEFAULTS.FONT_FAMILY,
    fontSize: LEGEND_DEFAULTS.FONT_SIZE,
    textColor: { hue: 0, saturation: 0, lightness: 0 },
    background: {
      enabled: true,
      color: { hue: 0, saturation: 0, lightness: 100 },
      opacity: LEGEND_DEFAULTS.OPACITY
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
  setDragPosition: (pos: LegendDragPosition | null) => void;
  setActiveTab: (tab: LegendTab) => void;
  updateStyle: (updates: Partial<LegendStyle>) => void;
  updateBackground: (
    updates: Partial<LegendState['style']['background']>
  ) => void;
  markAsOpened: () => void;
  syncWithVisualizations: () => void;
};

function getLegendSubtitle(visualization: VisualizationConfig): string {
  if (visualization.modes?.fill === FillMode.CATEGORIES) {
    return visualization.mapping.categoryColumn ?? '';
  }
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
    id: `${LEGEND_ID_PREFIXES.VIZ}${visualization.id}`,
    name: visualization.name,
    visible: true,
    title: visualization.name,
    titleMode: 'auto',
    subtitle: getLegendSubtitle(visualization),
    subtitleMode: 'auto',
    note: '',
    variableId: visualization.id
  };
}

function resolveTitleMode(existing: LegendItem): LegendTextMode {
  if (existing.titleMode) {
    return existing.titleMode;
  }

  return !existing.title || existing.title === existing.name
    ? 'auto'
    : 'custom';
}

function resolveSubtitleMode(
  existing: LegendItem,
  visualization: VisualizationConfig
): LegendTextMode {
  if (existing.subtitleMode) {
    return existing.subtitleMode;
  }

  const mappingValues = Object.values(visualization.mapping).filter(
    (value): value is string => Boolean(value)
  );

  return !existing.subtitle || mappingValues.includes(existing.subtitle)
    ? 'auto'
    : 'custom';
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
    const titleMode = resolveTitleMode(existing);
    const subtitleMode = resolveSubtitleMode(existing, visualization);

    return {
      ...existing,
      name: visualization.name,
      title: titleMode === 'auto' ? visualization.name : existing.title,
      titleMode,
      subtitle: subtitleMode === 'auto' ? defaultSubtitle : existing.subtitle,
      subtitleMode,
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
      current.titleMode !== next.titleMode ||
      current.subtitle !== next.subtitle ||
      current.subtitleMode !== next.subtitleMode ||
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
        id: `${LEGEND_ID_PREFIXES.CUSTOM}${Date.now()}`
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
    setDragPosition: (pos: LegendDragPosition | null) => {
      s.dragPosition = pos;
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

      if (!s.hasBeenOpened) {
        const fmt = getFormatState();
        const tokens = resolveLayoutSizingTokens(
          getFormatLayoutSizingContext(fmt)
        );
        s.style.fontSize = tokens.legend.fontSize;
      }
    }
  }),
  {
    key: 'legend',
    serializeFilter: ({ activeTab: _activeTab, ...persisted }) => persisted
  }
);

export const legendActions = actions;
export const getLegendState = getState;
