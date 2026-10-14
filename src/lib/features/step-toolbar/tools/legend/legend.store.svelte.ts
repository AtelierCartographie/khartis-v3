import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import {
  visualizationStore,
  type PrimitiveConfigKind,
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
  getComponentLegendSubtitle,
  getPrimitiveLegendSubtitle,
  joinLegendSubtitleParts,
  type LegendComponent,
  type LegendSubtitlePrimitive
} from '$lib/features/commons/utils/legend-subtitle.utils';
import { getFacetVisualizationId } from '$lib/features/commons/services/facet-generator.service';
import { facetsStore, SCALE_MODE } from '../facets';
import { LEGEND_DEFAULTS, LEGEND_ID_PREFIXES } from './legend.constants';
import { getLegendItemSlots, type LegendItemSlot } from './legend-items.utils';
import type {
  LegendItem,
  LegendItemLayout,
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
  updateLegendItemLayout: (id: string, updates: LegendItemLayout) => void;
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

const LEGEND_PRIMITIVE_BY_SLOT_KIND: Record<
  PrimitiveConfigKind,
  LegendSubtitlePrimitive
> = {
  polygon: 'area',
  symbol: 'point',
  line: 'line',
  text: 'text'
};

function isSharedCollectionLegend(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): boolean {
  const slotPath = facetsStore.primarySlotPath;
  return Boolean(
    facetsStore.enabled &&
    slotPath &&
    facetsStore.scaleMode === SCALE_MODE.SHARED &&
    visualization.facet?.baseVisualizationId ===
      facetsStore.baseVisualizationId &&
    LEGEND_PRIMITIVE_BY_SLOT_KIND[
      slotPath.split('.')[0] as PrimitiveConfigKind
    ] === primitive
  );
}

function truncateAutoTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length > LEGEND_DEFAULTS.AUTO_TITLE_MAX_LENGTH
    ? `${characters.slice(0, LEGEND_DEFAULTS.AUTO_TITLE_MAX_LENGTH - 1).join('')}…`
    : title;
}

function getDefaultLegendTitle(
  visualization: VisualizationConfig,
  slot: LegendItemSlot
): string {
  const variables = isSharedCollectionLegend(visualization, slot.primitive)
    ? joinLegendSubtitleParts(facetsStore.variables)
    : slot.split && slot.component
      ? getComponentLegendSubtitle(
          visualization,
          slot.primitive,
          slot.component
        )
      : getPrimitiveLegendSubtitle(visualization, slot.primitive);
  return truncateAutoTitle(variables || visualization.name);
}

function getComponentLabel(
  primitive: LegendSubtitlePrimitive,
  component: LegendComponent
): string {
  switch (component) {
    case 'stroke':
      return m.legend_component_stroke();
    case 'size':
      return primitive === 'line'
        ? m.legend_component_thickness()
        : m.legend_component_size();
    case 'color':
    default:
      return m.legend_component_color();
  }
}

function getLegendItemName(
  visualization: VisualizationConfig,
  slot: LegendItemSlot
): string {
  const name = `${visualization.name} — ${PRIMITIVE_LABELS[slot.primitive]()}`;
  return slot.split && slot.component
    ? `${name} (${getComponentLabel(slot.primitive, slot.component)})`
    : name;
}

function createLegendItemFromVisualization(
  visualization: VisualizationConfig,
  slot: LegendItemSlot
): LegendItem {
  return {
    id: slot.id,
    name: getLegendItemName(visualization, slot),
    visible: true,
    title: getDefaultLegendTitle(visualization, slot),
    titleMode: 'auto',
    subtitle: '',
    subtitleMode: 'auto',
    note: '',
    variableId: visualization.id,
    primitive: slot.primitive,
    ...(slot.component ? { component: slot.component } : {}),
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

function getPendingFacetVisualizationIds(
  visualizations: VisualizationConfig[]
): Set<string> {
  const baseVisualizationId = facetsStore.baseVisualizationId;
  if (!baseVisualizationId) {
    return new Set();
  }
  const presentIds = new Set(visualizations.map((viz) => viz.id));
  return new Set(
    facetsStore.variables
      .map((variable) => getFacetVisualizationId(baseVisualizationId, variable))
      .filter((id) => !presentIds.has(id))
  );
}

function findExistingLegendItem(
  currentItems: LegendItem[],
  usedItemIds: Set<string>,
  visualization: VisualizationConfig,
  slot: LegendItemSlot,
  isFirstSlot: boolean,
  isFirstPrimitive: boolean
): LegendItem | undefined {
  const candidates = currentItems.filter(
    (item) =>
      !usedItemIds.has(item.id) &&
      item.variableId === visualization.id &&
      item.primitive === slot.primitive
  );

  return (
    // A primitive that gains or loses a channel keeps each channel's legend:
    // the single legend records the channel it covers.
    candidates.find((item) => item.component === slot.component) ??
    (isFirstSlot ? candidates[0] : undefined) ??
    // A legend saved before primitives were split covers the whole
    // visualization, so its text and position carry over to the first one.
    (isFirstSlot && isFirstPrimitive
      ? currentItems.find(
          (item) =>
            !usedItemIds.has(item.id) &&
            !item.primitive &&
            (item.variableId === visualization.id ||
              (!item.variableId && item.name === visualization.name))
        )
      : undefined)
  );
}

function syncLegendItemsWithVisualizations(
  currentItems: LegendItem[],
  visualizations: VisualizationConfig[]
): LegendItem[] {
  const usedItemIds = new Set<string>();

  const linkedItems = visualizations.flatMap((visualization) =>
    getLegendItemSlots(visualization).map((slot, slotIndex, slots) => {
      const isFirstSlot =
        slots.findIndex((other) => other.primitive === slot.primitive) ===
        slotIndex;
      const existing = findExistingLegendItem(
        currentItems,
        usedItemIds,
        visualization,
        slot,
        isFirstSlot,
        slotIndex === 0
      );

      if (!existing) {
        return createLegendItemFromVisualization(visualization, slot);
      }

      usedItemIds.add(existing.id);

      const titleMode = resolveTitleMode(existing);
      const subtitleMode = resolveSubtitleMode(existing, visualization);
      const { component: _previousComponent, ...rest } = existing;

      return {
        ...rest,
        id: slot.id,
        name: getLegendItemName(visualization, slot),
        title:
          titleMode === 'auto'
            ? getDefaultLegendTitle(visualization, slot)
            : existing.title,
        titleMode,
        subtitle: subtitleMode === 'auto' ? '' : existing.subtitle,
        subtitleMode,
        variableId: visualization.id,
        primitive: slot.primitive,
        ...(slot.component ? { component: slot.component } : {}),
        dragPosition: existing.dragPosition ?? null
      };
    })
  );

  // A legend whose primitive or channel is switched off stays dormant, with
  // its text and position, until it comes back; it is not drawn meanwhile.
  const visualizationIds = new Set(visualizations.map((viz) => viz.id));
  const pendingFacetIds = getPendingFacetVisualizationIds(visualizations);
  const keptItems = currentItems.filter(
    (item) =>
      !usedItemIds.has(item.id) &&
      (!item.variableId ||
        visualizationIds.has(item.variableId) ||
        pendingFacetIds.has(item.variableId))
  );

  return [...linkedItems, ...keptItems];
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
      current.component !== next.component ||
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
    updateLegendItemLayout: (id: string, updates: LegendItemLayout) => {
      s.items = s.items.map((item) =>
        item.id === id
          ? { ...item, layout: { ...item.layout, ...updates } }
          : item
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
