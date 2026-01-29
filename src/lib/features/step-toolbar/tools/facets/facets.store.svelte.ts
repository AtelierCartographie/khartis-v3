import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
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

class FacetsStore {
  private _state = $state<FacetsState>({ ...DEFAULT_STATE });

  get enabled() {
    return this._state.enabled;
  }

  get baseVisualizationId() {
    return this._state.baseVisualizationId;
  }

  get variables() {
    return this._state.variables;
  }

  get layout() {
    return this._state.layout;
  }

  get scaleMode() {
    return this._state.scaleMode;
  }

  get syncPanZoom() {
    return this._state.syncPanZoom;
  }

  get generatedVisualizationIds() {
    return this._state.generatedVisualizationIds;
  }

  get facetVisualizations(): VisualizationConfig[] {
    if (!this._state.enabled) {
      return [];
    }

    return this._state.generatedVisualizationIds
      .map((id) => visualizationStore.visualizations.find((v) => v.id === id))
      .filter((v): v is VisualizationConfig => v !== undefined);
  }

  async enable(baseVizId: string, variables: string[]): Promise<void> {
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
      scaleMode: this._state.scaleMode
    });

    try {
      const facetConfigs = await generateFacetVisualizations(
        baseViz,
        variables,
        this._state.scaleMode
      );

      visualizationStore.createBulkVisualizations(facetConfigs);

      this._state.enabled = true;
      this._state.baseVisualizationId = baseVizId;
      this._state.variables = [...variables];
      this._state.generatedVisualizationIds = facetConfigs.map((c) => c.id);

      logger.success('Facets enabled', LogCategory.STORE, {
        facetsCount: facetConfigs.length
      });
    } catch (error) {
      logger.error('Failed to enable facets', LogCategory.STORE, error);
    }
  }

  disable(): void {
    if (!this._state.enabled) {
      return;
    }

    logger.info('Disabling facets mode', LogCategory.STORE);

    visualizationStore.removeBulkVisualizations(
      this._state.generatedVisualizationIds
    );

    this._state.enabled = false;
    this._state.baseVisualizationId = null;
    this._state.variables = [];
    this._state.generatedVisualizationIds = [];

    logger.success('Facets disabled', LogCategory.STORE);
  }

  setVariables(variables: string[]): void {
    this._state.variables = [...variables];
  }

  setColumns(columns: 2 | 3 | 4): void {
    this._state.layout.columns = columns;
  }

  setGap(gap: number): void {
    this._state.layout.gap = gap;
  }

  async toggleScaleMode(): Promise<void> {
    const newMode: ScaleMode =
      this._state.scaleMode === 'shared' ? 'independent' : 'shared';

    logger.info('Toggling scale mode', LogCategory.STORE, {
      from: this._state.scaleMode,
      to: newMode
    });

    this._state.scaleMode = newMode;

    if (this._state.enabled && this._state.baseVisualizationId) {
      const baseViz = visualizationStore.visualizations.find(
        (v) => v.id === this._state.baseVisualizationId
      );

      if (baseViz) {
        const newConfigs = await generateFacetVisualizations(
          baseViz,
          this._state.variables,
          newMode
        );

        visualizationStore.removeBulkVisualizations(
          this._state.generatedVisualizationIds
        );
        visualizationStore.createBulkVisualizations(newConfigs);
        this._state.generatedVisualizationIds = newConfigs.map((c) => c.id);

        logger.success(
          'Scale mode toggled and facets regenerated',
          LogCategory.STORE
        );
      }
    }
  }

  $effect(): void {
    $effect(() => {
      if (!this._state.enabled) return;

      const currentVizIds = new Set(
        visualizationStore.visualizations.map((v) => v.id)
      );
      const allPresent = this._state.generatedVisualizationIds.every((id) =>
        currentVizIds.has(id)
      );

      if (!allPresent) {
        logger.warn(
          'Facet visualization deleted manually, disabling facets mode',
          LogCategory.STORE
        );
        this.disable();
      }
    });
  }
}

export const facetsStore = new FacetsStore();
export const getFacetsState = () => facetsStore;
