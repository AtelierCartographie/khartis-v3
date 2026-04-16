import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import { generateFacetVisualizations } from '$lib/features/commons/utils/facet-generator';

export const SCALE_MODE = {
  SHARED: 'shared',
  INDEPENDENT: 'independent'
} as const;

export type ScaleMode = (typeof SCALE_MODE)[keyof typeof SCALE_MODE];

export interface FacetsLayout {
  columns: number;
  gap: number;
}

export interface FacetsState {
  enabled: boolean;
  baseVisualizationId: string | null;
  variables: string[];
  layout: FacetsLayout;
  scaleMode: ScaleMode;
  syncPanZoom: boolean;
  generatedVisualizationIds: string[];
}

const DEFAULT_STATE: FacetsState = {
  enabled: false,
  baseVisualizationId: null,
  variables: [],
  layout: {
    columns: 3,
    gap: 16
  },
  scaleMode: SCALE_MODE.INDEPENDENT,
  syncPanZoom: false,
  generatedVisualizationIds: []
};

function createFacetsStore() {
  const state = $state<FacetsState>({ ...DEFAULT_STATE });
  let isRegenerating = false;

  function notifyPersistence(): void {
    persistenceRegistry.notifyChange('facets');
  }

  function restoreFromSerialized(data: unknown): void {
    const restored = data as Partial<FacetsState> | undefined;
    const nextState = structuredClone(DEFAULT_STATE);

    if (restored) {
      Object.assign(nextState, restored);
    }

    nextState.variables = [...(restored?.variables ?? DEFAULT_STATE.variables)];
    nextState.generatedVisualizationIds = [
      ...(restored?.generatedVisualizationIds ??
        DEFAULT_STATE.generatedVisualizationIds)
    ];
    nextState.layout = {
      ...DEFAULT_STATE.layout,
      ...(restored?.layout ?? {})
    };

    Object.assign(state, nextState);
  }

  function getFacetVisualizations(): VisualizationConfig[] {
    if (!state.enabled) {
      return [];
    }

    return state.generatedVisualizationIds
      .map((id) => visualizationStore.visualizations.find((v) => v.id === id))
      .filter((v): v is VisualizationConfig => v !== undefined);
  }

  async function enable(baseVizId: string, variables: string[]): Promise<void> {
    if (variables.length < 2) {
      return;
    }

    const baseViz = visualizationStore.visualizations.find(
      (v) => v.id === baseVizId
    );

    if (!baseViz) {
      logger.error('Base visualization not found', LogCategory.STORE, {
        baseVizId
      });
      return;
    }

    try {
      const facetConfigs = await generateFacetVisualizations(
        baseViz,
        variables,
        state.scaleMode
      );

      visualizationStore.createBulkVisualizations(facetConfigs);

      state.enabled = true;
      state.baseVisualizationId = baseVizId;
      state.variables = [...variables];
      state.generatedVisualizationIds = facetConfigs.map((c) => c.id);
      notifyPersistence();

      logger.debug('Facets enabled', LogCategory.STORE, {
        facetsCount: facetConfigs.length
      });
    } catch (error) {
      logger.error('Failed to enable facets', LogCategory.STORE, error);
    }
  }

  function disable(): void {
    if (!state.enabled) {
      return;
    }

    visualizationStore.removeBulkVisualizations(
      state.generatedVisualizationIds
    );

    state.enabled = false;
    state.baseVisualizationId = null;
    state.variables = [];
    state.generatedVisualizationIds = [];
    notifyPersistence();

    logger.debug('Facets disabled', LogCategory.STORE);
  }

  function setVariables(variables: string[]): void {
    state.variables = [...variables];
    notifyPersistence();
  }

  async function updateVariables(
    baseVizId: string,
    variables: string[]
  ): Promise<void> {
    if (variables.length < 2) {
      if (state.enabled) {
        disable();
      }
      return;
    }

    if (!state.enabled || state.baseVisualizationId !== baseVizId) {
      await enable(baseVizId, variables);
      return;
    }

    const baseViz = visualizationStore.visualizations.find(
      (v) => v.id === baseVizId
    );
    if (!baseViz) {
      return;
    }

    isRegenerating = true;
    try {
      const newConfigs = await generateFacetVisualizations(
        baseViz,
        variables,
        state.scaleMode
      );
      visualizationStore.removeBulkVisualizations(
        state.generatedVisualizationIds
      );
      visualizationStore.createBulkVisualizations(newConfigs);
      state.variables = [...variables];
      state.generatedVisualizationIds = newConfigs.map((config) => config.id);
      notifyPersistence();
      logger.debug(
        'Variables updated and facets regenerated',
        LogCategory.STORE
      );
    } catch (error) {
      logger.error(
        'Failed to update facet variables',
        LogCategory.STORE,
        error
      );
    } finally {
      isRegenerating = false;
    }
  }

  function setVariableForSlot(
    mapIndex: number,
    slotKey: string,
    variableName: string
  ): boolean {
    if (!state.enabled) {
      return false;
    }

    const vizId = state.generatedVisualizationIds[mapIndex];
    if (!vizId) {
      return false;
    }

    const viz = visualizationStore.visualizations.find((v) => v.id === vizId);
    if (!viz) {
      return false;
    }

    visualizationStore.updateVisualization(vizId, {
      mapping: { ...viz.mapping, [slotKey]: variableName }
    });
    notifyPersistence();
    return true;
  }

  async function reorderVariables(
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    if (fromIndex === toIndex) return;

    const next = [...state.variables];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    state.variables = next;

    if (state.enabled && state.baseVisualizationId) {
      const baseViz = visualizationStore.visualizations.find(
        (v) => v.id === state.baseVisualizationId
      );

      if (baseViz) {
        isRegenerating = true;
        try {
          const newConfigs = await generateFacetVisualizations(
            baseViz,
            state.variables,
            state.scaleMode
          );

          visualizationStore.removeBulkVisualizations(
            state.generatedVisualizationIds
          );
          visualizationStore.createBulkVisualizations(newConfigs);
          state.generatedVisualizationIds = newConfigs.map(
            (config) => config.id
          );
          notifyPersistence();

          logger.debug(
            'Variables reordered and facets regenerated',
            LogCategory.STORE
          );
        } finally {
          isRegenerating = false;
        }
      }
    }
  }

  function setColumns(columns: number): void {
    state.layout.columns = columns;
    notifyPersistence();
  }

  function setGap(gap: number): void {
    state.layout.gap = gap;
    notifyPersistence();
  }

  function toggleSyncPanZoom(): void {
    state.syncPanZoom = !state.syncPanZoom;
    notifyPersistence();
  }

  async function toggleScaleMode(): Promise<void> {
    if (isRegenerating) return;

    const newMode: ScaleMode =
      state.scaleMode === SCALE_MODE.SHARED
        ? SCALE_MODE.INDEPENDENT
        : SCALE_MODE.SHARED;

    state.scaleMode = newMode;

    if (state.enabled && state.baseVisualizationId) {
      const baseViz = visualizationStore.visualizations.find(
        (v) => v.id === state.baseVisualizationId
      );

      if (baseViz) {
        isRegenerating = true;
        try {
          const newConfigs = await generateFacetVisualizations(
            baseViz,
            state.variables,
            newMode
          );

          visualizationStore.removeBulkVisualizations(
            state.generatedVisualizationIds
          );
          visualizationStore.createBulkVisualizations(newConfigs);
          state.generatedVisualizationIds = newConfigs.map(
            (config) => config.id
          );
          notifyPersistence();

          logger.debug(
            'Scale mode toggled and facets regenerated',
            LogCategory.STORE
          );
        } finally {
          isRegenerating = false;
        }
      }
    }
  }

  return {
    get enabled() {
      return state.enabled;
    },
    get baseVisualizationId() {
      return state.baseVisualizationId;
    },
    get variables() {
      return state.variables;
    },
    get layout() {
      return state.layout;
    },
    get scaleMode() {
      return state.scaleMode;
    },
    get syncPanZoom() {
      return state.syncPanZoom;
    },
    get generatedVisualizationIds() {
      return state.generatedVisualizationIds;
    },
    get facetVisualizations(): VisualizationConfig[] {
      return getFacetVisualizations();
    },
    enable,
    disable,
    setVariables,
    updateVariables,
    setVariableForSlot,
    reorderVariables,
    setColumns,
    setGap,
    toggleScaleMode,
    toggleSyncPanZoom,
    restoreFromSerialized
  };
}

export const facetsStore = createFacetsStore();

persistenceRegistry.register({
  key: 'facets',
  serialize: () => ({
    enabled: facetsStore.enabled,
    baseVisualizationId: facetsStore.baseVisualizationId,
    variables: [...facetsStore.variables],
    layout: { ...facetsStore.layout },
    scaleMode: facetsStore.scaleMode,
    syncPanZoom: facetsStore.syncPanZoom,
    generatedVisualizationIds: [...facetsStore.generatedVisualizationIds]
  }),
  deserialize: (data: unknown) => facetsStore.restoreFromSerialized(data),
  reset: () => facetsStore.restoreFromSerialized(undefined),
  priority: 'debounced'
});
