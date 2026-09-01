import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import * as m from '$lib/paraglide/messages';
import {
  clampFontSize,
  CARTOGRAPHIC_FONT_FAMILY,
  normalizeFontFamily
} from '$lib/features/step-toolbar/fonts.constants';
import {
  getEnabledLegendPrimitives,
  getPrimitiveLegendSubtitle,
  getVisualizationLegendSubtitle,
  type LegendSubtitlePrimitive
} from '$lib/features/commons/utils/legend-subtitle.utils';
import { LEGEND_DEFAULTS, LEGEND_ID_PREFIXES } from './legend.constants';
import type {
  LegendItem,
  LegendState,
  LegendStyle
} from '../../types/legend.types';

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
  setActiveTab: (tab: LegendTab) => void;
  updateStyle: (updates: Partial<LegendStyle>) => void;
  updateBackground: (
    updates: Partial<LegendState['style']['background']>
  ) => void;
  markAsOpened: () => void;
  syncWithVisualizations: () => void;
};

const PRIMITIVE_LABELS: Record<LegendSubtitlePrimitive, () => string> = {
  point: () => m.symbols_title(),
  area: () => m.polygons_title(),
  line: () => m.lines_title(),
  text: () => m.texts_title()
};

function getLegendSubtitle(
  visualization: VisualizationConfig,
  primitive?: LegendSubtitlePrimitive
): string {
  return primitive
    ? getPrimitiveLegendSubtitle(visualization, primitive)
    : getVisualizationLegendSubtitle(visualization);
}

function getLegendItemName(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): string {
  return `${visualization.name} — ${PRIMITIVE_LABELS[primitive]()}`;
}

function getLegendItemId(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): string {
  return `${LEGEND_ID_PREFIXES.VIZ}${visualization.id}--${primitive}`;
}

function createLegendItemFromVisualization(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): LegendItem {
  return {
    id: getLegendItemId(visualization, primitive),
    name: getLegendItemName(visualization, primitive),
    visible: true,
    title: visualization.name,
    titleMode: 'auto',
    subtitle: getLegendSubtitle(visualization, primitive),
    subtitleMode: 'auto',
    note: '',
    variableId: visualization.id,
    primitive,
    dragPosition: null
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

  const linkedItems = visualizations.flatMap((visualization) => {
    const primitives = getEnabledLegendPrimitives(visualization);

    return primitives.map((primitive, index) => {
      const existing =
        currentItems.find(
          (item) =>
            item.variableId === visualization.id && item.primitive === primitive
        ) ??
        // A legend saved before primitives were split covers the whole
        // visualization, so its text and position carry over to the first one.
        (index === 0
          ? currentItems.find(
              (item) =>
                !item.primitive &&
                (item.variableId === visualization.id ||
                  (!item.variableId && item.name === visualization.name))
            )
          : undefined);

      if (!existing) {
        return createLegendItemFromVisualization(visualization, primitive);
      }

      usedItemIds.add(existing.id);

      const name = getLegendItemName(visualization, primitive);
      const defaultSubtitle = getLegendSubtitle(visualization, primitive);
      const titleMode = resolveTitleMode(existing);
      const subtitleMode = resolveSubtitleMode(existing, visualization);

      return {
        ...existing,
        id: getLegendItemId(visualization, primitive),
        name,
        title: titleMode === 'auto' ? visualization.name : existing.title,
        titleMode,
        subtitle: subtitleMode === 'auto' ? defaultSubtitle : existing.subtitle,
        subtitleMode,
        variableId: visualization.id,
        primitive,
        dragPosition: existing.dragPosition ?? null
      };
    });
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
      current.variableId !== next.variableId ||
      current.primitive !== next.primitive ||
      current.dragPosition?.x !== next.dragPosition?.x ||
      current.dragPosition?.y !== next.dragPosition?.y
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
    setActiveTab: (tab: LegendTab) => {
      s.activeTab = tab;
    },
    updateStyle: (updates: Partial<LegendStyle>) => {
      const normalizedUpdates = { ...updates };
      if (updates.fontFamily !== undefined) {
        normalizedUpdates.fontFamily =
          normalizeFontFamily(updates.fontFamily) ?? CARTOGRAPHIC_FONT_FAMILY;
      }
      if (updates.fontSize !== undefined) {
        normalizedUpdates.fontSize = clampFontSize(
          updates.fontSize,
          LEGEND_DEFAULTS.FONT_SIZE
        );
      }
      Object.assign(s.style, normalizedUpdates);
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
  }),
  {
    key: 'legend',
    serializeFilter: ({ activeTab: _activeTab, ...persisted }) => persisted
  }
);

export const legendActions = actions;
export const getLegendState = getState;
