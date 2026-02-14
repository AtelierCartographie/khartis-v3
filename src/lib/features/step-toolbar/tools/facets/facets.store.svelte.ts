import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { generateFacetVisualizations } from '$lib/features/commons/utils/facet-generator';

export type ScaleMode = 'shared' | 'independent';

export interface FacetsLayout {
  columns: 2 | 3 | 4;
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
  scaleMode: 'independent',
  syncPanZoom: false,
  generatedVisualizationIds: []
};

function createFacetsStore() {
  const state = $state<FacetsState>({ ...DEFAULT_STATE });

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
      logger.warn('Facets require at least 2 variables', LogCategory.STORE);
      return;
    }

    if (variables.length > 9) {
      logger.warn(
        'More than 9 facets may impact performance',
        LogCategory.STORE
      );
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

    logger.info('Enabling facets mode', LogCategory.STORE, {
      baseVizId,
      variablesCount: variables.length,
      scaleMode: state.scaleMode
    });

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

      logger.success('Facets enabled', LogCategory.STORE, {
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

    logger.info('Disabling facets mode', LogCategory.STORE);

    visualizationStore.removeBulkVisualizations(
      state.generatedVisualizationIds
    );

    state.enabled = false;
    state.baseVisualizationId = null;
    state.variables = [];
    state.generatedVisualizationIds = [];

    logger.success('Facets disabled', LogCategory.STORE);
  }

  function setVariables(variables: string[]): void {
    state.variables = [...variables];
  }

  function setColumns(columns: 2 | 3 | 4): void {
    state.layout.columns = columns;
  }

  function setGap(gap: number): void {
    state.layout.gap = gap;
  }

  async function toggleScaleMode(): Promise<void> {
    const newMode: ScaleMode =
      state.scaleMode === 'shared' ? 'independent' : 'shared';

    logger.info('Toggling scale mode', LogCategory.STORE, {
      from: state.scaleMode,
      to: newMode
    });

    state.scaleMode = newMode;

    if (state.enabled && state.baseVisualizationId) {
      const baseViz = visualizationStore.visualizations.find(
        (v) => v.id === state.baseVisualizationId
      );

      if (baseViz) {
        const newConfigs = await generateFacetVisualizations(
          baseViz,
          state.variables,
          newMode
        );

        visualizationStore.removeBulkVisualizations(
          state.generatedVisualizationIds
        );
        visualizationStore.createBulkVisualizations(newConfigs);
        state.generatedVisualizationIds = newConfigs.map((config) => config.id);

        logger.success(
          'Scale mode toggled and facets regenerated',
          LogCategory.STORE
        );
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
    setColumns,
    setGap,
    toggleScaleMode
  };
}

export const facetsStore = createFacetsStore();
export const getFacetsState = () => facetsStore;
