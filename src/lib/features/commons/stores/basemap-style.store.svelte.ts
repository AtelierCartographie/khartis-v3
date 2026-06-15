import type maplibregl from 'maplibre-gl';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core/persistence-registry';
import {
  BasemapStyle,
  DEFAULT_BASEMAP_STYLE,
  DEFAULT_TILED_BASEMAP_STYLE,
  getBasemapStyle
} from '../../map/constants/basemap-styles';
import {
  getStyleConfig,
  getDefaultVisibility,
  type LayerGroupId
} from '../../map/constants/carte-facile-layer-groups';

function getInitialGroupVisibility(
  style: BasemapStyle
): Record<string, boolean> {
  const config = getStyleConfig(style);
  if (!config) return {};
  return getDefaultVisibility(config) as Record<string, boolean>;
}

const LEGACY_STYLE_MIGRATION: Record<string, BasemapStyle> = {
  'carte-facile-desaturated': BasemapStyle.FRANCE_NIVEAUX_DE_GRIS,
  'carte-facile-simple': BasemapStyle.FRANCE_COULEURS,
  'carte-facile-aerial': BasemapStyle.FRANCE_SATELLITE
};

function migrateLegacyStyle(raw: string): BasemapStyle | null {
  return LEGACY_STYLE_MIGRATION[raw] ?? null;
}

function normalizeLastSelectedTiledStyle(
  style: BasemapStyle | null | undefined
): BasemapStyle {
  return style && style !== BasemapStyle.BLANK_WHITE
    ? style
    : DEFAULT_TILED_BASEMAP_STYLE;
}

function createBasemapStyleStore() {
  const state = $state({
    selectedStyle: DEFAULT_BASEMAP_STYLE,
    lastSelectedTiledStyle: DEFAULT_TILED_BASEMAP_STYLE,
    hasTiledStyleHistory: false,
    referenceBasemapId: null as string | null,
    showLabels: true,
    groupVisibility: {} as Record<string, boolean>,
    requestedViewportStyle: null as BasemapStyle | null,
    requestedViewportPreferPreset: false
  });

  let groupVisibilityVersion = $state(0);
  let viewportRequestVersion = $state(0);
  let styleVersion = $state(0);

  function setReferenceBasemap(id: string | null): void {
    state.referenceBasemapId = id;
    persistenceRegistry.notifyChange('basemapStyle', SavePriority.IMMEDIATE);
  }

  function setStyle(style: BasemapStyle): void {
    const previousStyle = state.selectedStyle;
    const shouldPreserveGroupVisibility =
      style === BasemapStyle.BLANK_WHITE ||
      (previousStyle === BasemapStyle.BLANK_WHITE &&
        state.hasTiledStyleHistory &&
        style === state.lastSelectedTiledStyle);

    state.selectedStyle = style;
    styleVersion++;

    if (style !== BasemapStyle.BLANK_WHITE) {
      state.lastSelectedTiledStyle = style;
      state.hasTiledStyleHistory = true;
    }

    if (!shouldPreserveGroupVisibility) {
      state.groupVisibility = getInitialGroupVisibility(style);
      groupVisibilityVersion++;
    }

    persistenceRegistry.notifyChange('basemapStyle', SavePriority.IMMEDIATE);
  }

  function setShowLabels(show: boolean): void {
    state.showLabels = show;
    persistenceRegistry.notifyChange('basemapStyle', SavePriority.IMMEDIATE);
  }

  function setGroupVisibility(groupId: LayerGroupId, visible: boolean): void {
    state.groupVisibility[groupId] = visible;
    groupVisibilityVersion++;
    persistenceRegistry.notifyChange('basemapStyle', SavePriority.IMMEDIATE);
  }

  function requestViewportReset(
    style: BasemapStyle = state.selectedStyle,
    options?: { preferPreset?: boolean }
  ): void {
    state.requestedViewportStyle = style;
    state.requestedViewportPreferPreset = options?.preferPreset ?? false;
    viewportRequestVersion++;
  }

  function reset(): void {
    state.selectedStyle = DEFAULT_BASEMAP_STYLE;
    state.lastSelectedTiledStyle = DEFAULT_TILED_BASEMAP_STYLE;
    state.hasTiledStyleHistory = false;
    state.referenceBasemapId = null;
    state.showLabels = true;
    state.groupVisibility = {};
    state.requestedViewportStyle = null;
    state.requestedViewportPreferPreset = false;
    groupVisibilityVersion++;
    viewportRequestVersion = 0;
    styleVersion++;
  }

  function restoreFromSerialized(
    style: BasemapStyle,
    lastSelectedTiledStyle?: BasemapStyle | null,
    referenceBasemapId?: string | null,
    showLabels?: boolean,
    groupVisibility?: Record<string, boolean>
  ): void {
    if (!style) {
      reset();
      return;
    }
    if (!Object.values(BasemapStyle).includes(style)) {
      const migrated = migrateLegacyStyle(style);
      if (migrated) {
        style = migrated;
      } else {
        reset();
        return;
      }
    }

    const normalizedLastSelectedTiledStyle = normalizeLastSelectedTiledStyle(
      lastSelectedTiledStyle ??
        (style !== BasemapStyle.BLANK_WHITE ? style : null)
    );
    const hasTiledStyleHistory =
      style !== BasemapStyle.BLANK_WHITE ||
      lastSelectedTiledStyle !== undefined;

    state.selectedStyle = style;
    state.lastSelectedTiledStyle = normalizedLastSelectedTiledStyle;
    state.hasTiledStyleHistory = hasTiledStyleHistory;
    state.groupVisibility =
      groupVisibility ??
      (style === BasemapStyle.BLANK_WHITE
        ? hasTiledStyleHistory
          ? getInitialGroupVisibility(normalizedLastSelectedTiledStyle)
          : {}
        : getInitialGroupVisibility(style));
    groupVisibilityVersion++;
    styleVersion++;
    if (referenceBasemapId !== undefined) {
      state.referenceBasemapId = referenceBasemapId;
    }
    if (showLabels !== undefined) {
      state.showLabels = showLabels;
    }
  }

  return {
    get selectedStyle(): BasemapStyle {
      return state.selectedStyle;
    },
    get selectedStyleUrl(): string | maplibregl.StyleSpecification {
      return getBasemapStyle(state.selectedStyle);
    },
    get requiresMapLibre(): boolean {
      return state.selectedStyle !== BasemapStyle.BLANK_WHITE;
    },
    get preferredTiledStyle(): BasemapStyle {
      return normalizeLastSelectedTiledStyle(
        state.hasTiledStyleHistory ? state.lastSelectedTiledStyle : null
      );
    },
    get lastSelectedTiledStyle(): BasemapStyle | undefined {
      return state.hasTiledStyleHistory
        ? state.lastSelectedTiledStyle
        : undefined;
    },
    get referenceBasemapId(): string | null {
      return state.referenceBasemapId;
    },
    get showLabels(): boolean {
      return state.showLabels;
    },
    get groupVisibility(): Readonly<Record<string, boolean>> {
      return state.groupVisibility;
    },
    get groupVisibilityVersion(): number {
      return groupVisibilityVersion;
    },
    get styleVersion(): number {
      return styleVersion;
    },
    get requestedViewportStyle(): BasemapStyle | null {
      return state.requestedViewportStyle;
    },
    get requestedViewportPreferPreset(): boolean {
      return state.requestedViewportPreferPreset;
    },
    get viewportRequestVersion(): number {
      return viewportRequestVersion;
    },
    setReferenceBasemap,
    setStyle,
    setShowLabels,
    setGroupVisibility,
    requestViewportReset,
    reset,
    restoreFromSerialized
  };
}

export const basemapStyleStore = createBasemapStyleStore();

persistenceRegistry.register({
  key: 'basemapStyle',
  serialize: () => ({
    style: basemapStyleStore.selectedStyle,
    lastSelectedTiledStyle: basemapStyleStore.lastSelectedTiledStyle,
    referenceBasemapId: basemapStyleStore.referenceBasemapId,
    showLabels: basemapStyleStore.showLabels,
    groupVisibility: basemapStyleStore.groupVisibility
  }),
  deserialize: (data: unknown) => {
    const d = data as {
      style?: string;
      lastSelectedTiledStyle?: BasemapStyle | null;
      referenceBasemapId?: string | null;
      showLabels?: boolean;
      groupVisibility?: Record<string, boolean>;
    };
    basemapStyleStore.restoreFromSerialized(
      d.style as Parameters<typeof basemapStyleStore.restoreFromSerialized>[0],
      d.lastSelectedTiledStyle,
      d.referenceBasemapId,
      d.showLabels,
      d.groupVisibility
    );
  },
  reset: () => basemapStyleStore.reset(),
  priority: 'debounced'
});

export { DEFAULT_TILED_BASEMAP_STYLE };
