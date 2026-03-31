import type maplibregl from 'maplibre-gl';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
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

function getInitialGroupVisibility(style: BasemapStyle): Record<string, boolean> {
  const config = getStyleConfig(style);
  if (!config) return {};
  return getDefaultVisibility(config) as Record<string, boolean>;
}

function createBasemapStyleStore() {
  const state = $state({
    selectedStyle: DEFAULT_BASEMAP_STYLE,
    referenceBasemapId: null as string | null,
    showLabels: true,
    groupVisibility: {} as Record<string, boolean>
  });

  let groupVisibilityVersion = $state(0);

  function setReferenceBasemap(id: string | null): void {
    state.referenceBasemapId = id;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function setStyle(style: BasemapStyle): void {
    state.selectedStyle = style;
    state.groupVisibility = getInitialGroupVisibility(style);
    groupVisibilityVersion++;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function setShowLabels(show: boolean): void {
    state.showLabels = show;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function setGroupVisibility(groupId: LayerGroupId, visible: boolean): void {
    state.groupVisibility[groupId] = visible;
    groupVisibilityVersion++;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function reset(): void {
    state.selectedStyle = DEFAULT_BASEMAP_STYLE;
    state.referenceBasemapId = null;
    state.showLabels = true;
    state.groupVisibility = {};
    groupVisibilityVersion++;
  }

  function restoreFromSerialized(
    style: BasemapStyle,
    referenceBasemapId?: string | null,
    showLabels?: boolean,
    groupVisibility?: Record<string, boolean>
  ): void {
    if (!style || !Object.values(BasemapStyle).includes(style)) {
      reset();
      return;
    }
    state.selectedStyle = style;
    state.groupVisibility = groupVisibility ?? getInitialGroupVisibility(style);
    groupVisibilityVersion++;
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
    setReferenceBasemap,
    setStyle,
    setShowLabels,
    setGroupVisibility,
    reset,
    restoreFromSerialized
  };
}

export const basemapStyleStore = createBasemapStyleStore();

persistenceRegistry.register({
  key: 'basemapStyle',
  serialize: () => ({
    style: basemapStyleStore.selectedStyle,
    referenceBasemapId: basemapStyleStore.referenceBasemapId,
    showLabels: basemapStyleStore.showLabels,
    groupVisibility: basemapStyleStore.groupVisibility
  }),
  deserialize: (data: unknown) => {
    const d = data as {
      style?: string;
      referenceBasemapId?: string | null;
      showLabels?: boolean;
      groupVisibility?: Record<string, boolean>;
    };
    basemapStyleStore.restoreFromSerialized(
      d.style as Parameters<typeof basemapStyleStore.restoreFromSerialized>[0],
      d.referenceBasemapId,
      d.showLabels,
      d.groupVisibility
    );
  },
  reset: () => basemapStyleStore.reset(),
  priority: 'debounced'
});

export { DEFAULT_TILED_BASEMAP_STYLE };
