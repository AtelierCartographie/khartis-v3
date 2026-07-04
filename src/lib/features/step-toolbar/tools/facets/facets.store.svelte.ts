import {
  visualizationStore,
  getEnabledPrimitiveFilters,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showInfo } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';
import { persistenceRegistry } from '$lib/features/project-management/core';
import {
  buildFacetVisualizationUpdates,
  generateFacetVisualizations,
  resolveFacetPrimitiveFilter
} from '$lib/features/commons/services/facet-generator.service';
import {
  FACET_SLOT,
  SCALE_MODE,
  facetSlotRequiresNumericVariable,
  isFacetSlotPath,
  type FacetSlotPath,
  type ScaleMode
} from '$lib/features/commons/constants/facets.constants';
import {
  buildFacetVariablePatch,
  getFacetSlotVariable
} from '$lib/features/commons/utils/facet-visualization-updates';
import {
  isAutoFacetDataColumn,
  isAutoFacetNumericColumn
} from '$lib/features/commons/utils/visualization-columns.utils';

export { FACET_SLOT, SCALE_MODE };
export type { FacetSlotPath, ScaleMode };

export const MAX_FACETS_COLUMNS = 4;
export const MAX_FACETS = 16;

function getCompatibleDatasetVariables(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath
): string[] {
  const dataset = datasetsStore.datasets.find(
    (candidate) => candidate.id === visualization.datasetId
  );
  if (!dataset?.columns?.length) {
    return [];
  }

  return dataset.columns
    .filter((column) =>
      facetSlotRequiresNumericVariable(slotPath)
        ? isAutoFacetNumericColumn(column)
        : isAutoFacetDataColumn(column)
    )
    .map((column) => column.name);
}

function filterCompatibleFacetVariables(
  visualization: VisualizationConfig,
  variables: string[],
  slotPath: FacetSlotPath
): string[] {
  const sanitized = variables.filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  const dataset = datasetsStore.datasets.find(
    (candidate) => candidate.id === visualization.datasetId
  );
  if (!dataset?.columns?.length) {
    return sanitized;
  }

  const compatibleColumns = new Set(
    dataset.columns
      .filter((column) =>
        facetSlotRequiresNumericVariable(slotPath)
          ? isAutoFacetNumericColumn(column)
          : isAutoFacetDataColumn(column)
      )
      .map((column) => column.name)
  );

  return sanitized.filter((variable) => compatibleColumns.has(variable));
}

function normalizeFacetVariablesForEnable(
  visualization: VisualizationConfig,
  variables: string[],
  slotPath: FacetSlotPath
): string[] {
  const compatible = filterCompatibleFacetVariables(
    visualization,
    variables,
    slotPath
  );
  if (compatible.length >= 2 || !facetSlotRequiresNumericVariable(slotPath)) {
    return compatible;
  }

  const nextCompatible = [...compatible];
  for (const variable of getCompatibleDatasetVariables(
    visualization,
    slotPath
  )) {
    if (nextCompatible.length >= 2) {
      break;
    }
    if (!nextCompatible.includes(variable)) {
      nextCompatible.push(variable);
    }
  }

  return nextCompatible;
}

function isFacetVariableCompatible(
  visualization: VisualizationConfig,
  variableName: string,
  slotPath: FacetSlotPath
): boolean {
  return (
    filterCompatibleFacetVariables(visualization, [variableName], slotPath)
      .length === 1
  );
}

function applyFacetVariableToVisualization(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath,
  variableName: string
): Partial<VisualizationConfig> {
  return buildFacetVariablePatch(visualization, slotPath, variableName);
}

function computeBestColumns(
  mapCount: number,
  maxCols: number = MAX_FACETS_COLUMNS
): number {
  if (mapCount <= 1) return 1;
  if (mapCount === 2) return 2;
  if (mapCount === 3) return 3;
  if (mapCount === 4) return 2;
  return Math.min(maxCols, Math.ceil(Math.sqrt(mapCount)));
}

export interface FacetsLayout {
  columns: number;
  gap: number;
}

export interface FacetsState {
  enabled: boolean;
  baseVisualizationId: string | null;
  primarySlotPath: FacetSlotPath | null;
  variables: string[];
  layout: FacetsLayout;
  scaleMode: ScaleMode;
  generatedVisualizationIds: string[];
  /** Custom facet titles keyed by facet variable name (Habillage step). */
  facetTitles: Record<string, string>;
}

const DEFAULT_STATE: FacetsState = {
  enabled: false,
  baseVisualizationId: null,
  primarySlotPath: null,
  variables: [],
  layout: {
    columns: 3,
    gap: 16
  },
  scaleMode: SCALE_MODE.SHARED,
  generatedVisualizationIds: [],
  facetTitles: {}
};

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function getHiddenPrimitivesForSlot(
  baseViz: VisualizationConfig,
  primarySlotPath: FacetSlotPath
): PrimitiveFilter[] {
  const targetPrimitive = resolveFacetPrimitiveFilter(primarySlotPath);
  return getEnabledPrimitiveFilters(baseViz).filter(
    (primitive) => primitive !== targetPrimitive
  );
}

function notifyCollectionConstraints(
  replacedPreviousCollection: boolean,
  hiddenPrimitives: PrimitiveFilter[]
): void {
  const hasHiddenPrimitives = hiddenPrimitives.length > 0;
  if (!replacedPreviousCollection && !hasHiddenPrimitives) {
    return;
  }

  const subtitle =
    replacedPreviousCollection && hasHiddenPrimitives
      ? m.facets_notice_replaced_and_hidden()
      : replacedPreviousCollection
        ? m.facets_notice_replaced()
        : m.facets_notice_hidden();

  showInfo(m.facets_notice_title(), subtitle);
}

function createFacetsStore() {
  const state = $state<FacetsState>({ ...DEFAULT_STATE });
  let isRegenerating = false;

  function notifyPersistence(): void {
    persistenceRegistry.notifyChange('facets');
  }

  function canReorderGeneratedFacets(nextGeneratedIds: string[]): boolean {
    if (nextGeneratedIds.length !== state.generatedVisualizationIds.length) {
      return false;
    }

    const currentIds = new Set(
      visualizationStore.visualizations.map((visualization) => visualization.id)
    );

    return nextGeneratedIds.every((id) => currentIds.has(id));
  }

  function applyGeneratedFacetOrder(nextGeneratedIds: string[]): void {
    const reorderedVisualizations = visualizationStore.visualizations.map(
      (visualization) => visualization.id
    );
    let nextFacetIndex = 0;

    for (let i = 0; i < reorderedVisualizations.length; i += 1) {
      if (
        !state.generatedVisualizationIds.includes(reorderedVisualizations[i])
      ) {
        continue;
      }

      reorderedVisualizations[i] = nextGeneratedIds[nextFacetIndex];
      nextFacetIndex += 1;
    }

    visualizationStore.setVisualizationOrder(reorderedVisualizations);
  }

  function restoreFromSerialized(data: unknown): void {
    const nextState = structuredClone(DEFAULT_STATE);

    if (data != null && typeof data === 'object') {
      const restored = data as Record<string, unknown>;

      nextState.enabled =
        typeof restored.enabled === 'boolean'
          ? restored.enabled
          : DEFAULT_STATE.enabled;

      nextState.baseVisualizationId =
        typeof restored.baseVisualizationId === 'string'
          ? restored.baseVisualizationId
          : DEFAULT_STATE.baseVisualizationId;

      nextState.primarySlotPath = isFacetSlotPath(restored.primarySlotPath)
        ? restored.primarySlotPath
        : DEFAULT_STATE.primarySlotPath;

      nextState.variables = Array.isArray(restored.variables)
        ? (restored.variables as unknown[]).filter(
            (v): v is string => typeof v === 'string'
          )
        : [...DEFAULT_STATE.variables];

      nextState.generatedVisualizationIds = Array.isArray(
        restored.generatedVisualizationIds
      )
        ? (restored.generatedVisualizationIds as unknown[]).filter(
            (v): v is string => typeof v === 'string'
          )
        : [...DEFAULT_STATE.generatedVisualizationIds];

      nextState.scaleMode =
        restored.scaleMode === SCALE_MODE.SHARED ||
        restored.scaleMode === SCALE_MODE.INDEPENDENT
          ? (restored.scaleMode as ScaleMode)
          : DEFAULT_STATE.scaleMode;

      const restoredLayout =
        restored.layout != null && typeof restored.layout === 'object'
          ? (restored.layout as Record<string, unknown>)
          : null;

      nextState.layout = {
        columns: Math.max(
          1,
          Math.min(
            MAX_FACETS_COLUMNS,
            typeof restoredLayout?.columns === 'number'
              ? restoredLayout.columns
              : DEFAULT_STATE.layout.columns
          )
        ),
        gap:
          typeof restoredLayout?.gap === 'number' && restoredLayout.gap >= 0
            ? restoredLayout.gap
            : DEFAULT_STATE.layout.gap
      };

      nextState.facetTitles =
        restored.facetTitles != null && typeof restored.facetTitles === 'object'
          ? Object.fromEntries(
              Object.entries(
                restored.facetTitles as Record<string, unknown>
              ).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string'
              )
            )
          : { ...DEFAULT_STATE.facetTitles };
    }

    Object.assign(state, nextState);
  }

  function getFacetVisualizations(): VisualizationConfig[] {
    if (!state.enabled) {
      return [];
    }

    if (
      state.baseVisualizationId &&
      !visualizationStore.visualizations.some(
        (v) => v.id === state.baseVisualizationId
      )
    ) {
      return [];
    }

    return state.generatedVisualizationIds
      .map((id) => visualizationStore.visualizations.find((v) => v.id === id))
      .filter((v): v is VisualizationConfig => v !== undefined);
  }

  async function enable(
    baseVizId: string,
    variables: string[],
    primarySlotPath: FacetSlotPath = FACET_SLOT.POLYGON_VALUE
  ): Promise<void> {
    const baseViz = visualizationStore.visualizations.find(
      (v) => v.id === baseVizId
    );

    if (!baseViz) {
      logger.error('Base visualization not found', LogCategory.STORE, {
        baseVizId
      });
      return;
    }

    const compatible = normalizeFacetVariablesForEnable(
      baseViz,
      variables,
      primarySlotPath
    );
    if (compatible.length < 2) {
      return;
    }

    const capped = compatible.slice(0, MAX_FACETS);
    const replacedPreviousCollection =
      state.enabled && state.generatedVisualizationIds.length > 0;
    const hiddenPrimitives = getHiddenPrimitivesForSlot(
      baseViz,
      primarySlotPath
    );

    try {
      const facetConfigs = await generateFacetVisualizations(
        baseViz,
        capped,
        state.scaleMode,
        primarySlotPath
      );

      if (state.generatedVisualizationIds.length > 0) {
        visualizationStore.removeBulkVisualizations(
          state.generatedVisualizationIds
        );
      }
      visualizationStore.createBulkVisualizations(facetConfigs);

      state.enabled = true;
      state.baseVisualizationId = baseVizId;
      state.primarySlotPath = primarySlotPath;
      state.variables = [...capped];
      state.generatedVisualizationIds = facetConfigs.map((c) => c.id);
      state.layout.columns = computeBestColumns(capped.length);
      notifyPersistence();

      notifyCollectionConstraints(replacedPreviousCollection, hiddenPrimitives);
    } catch (error) {
      logger.error('Failed to enable facets', LogCategory.STORE, error);
    }
  }

  async function restoreGeneratedVisualizations(): Promise<void> {
    if (
      !state.enabled ||
      !state.baseVisualizationId ||
      !state.primarySlotPath ||
      state.variables.length < 2
    ) {
      return;
    }

    const baseViz = visualizationStore.visualizations.find(
      (v) => v.id === state.baseVisualizationId
    );
    if (!baseViz) {
      disable();
      return;
    }

    const existingVisualizationIds = new Set(
      visualizationStore.visualizations.map((visualization) => visualization.id)
    );
    const hasAllGeneratedVisualizations =
      state.generatedVisualizationIds.length === state.variables.length &&
      state.generatedVisualizationIds.every((id) =>
        existingVisualizationIds.has(id)
      );

    if (hasAllGeneratedVisualizations) {
      return;
    }

    const compatible = normalizeFacetVariablesForEnable(
      baseViz,
      state.variables,
      state.primarySlotPath
    ).slice(0, MAX_FACETS);

    if (compatible.length < 2) {
      disable();
      return;
    }

    const staleGeneratedIds = state.generatedVisualizationIds.filter((id) =>
      existingVisualizationIds.has(id)
    );

    isRegenerating = true;
    try {
      const facetConfigs = await generateFacetVisualizations(
        baseViz,
        compatible,
        state.scaleMode,
        state.primarySlotPath
      );

      if (staleGeneratedIds.length > 0) {
        visualizationStore.removeBulkVisualizations(staleGeneratedIds);
      }
      visualizationStore.createBulkVisualizations(facetConfigs);

      state.variables = [...compatible];
      state.generatedVisualizationIds = facetConfigs.map((config) => config.id);
      notifyPersistence();
    } catch (error) {
      logger.error(
        'Failed to restore generated facet visualizations',
        LogCategory.STORE,
        error
      );
    } finally {
      isRegenerating = false;
    }
  }

  async function syncGeneratedVisualizationsFromBase(
    baseVizId?: string
  ): Promise<void> {
    if (
      isRegenerating ||
      !state.enabled ||
      !state.baseVisualizationId ||
      !state.primarySlotPath
    ) {
      return;
    }

    if (baseVizId && baseVizId !== state.baseVisualizationId) {
      return;
    }

    const primarySlotPath = state.primarySlotPath;
    const baseViz = visualizationStore.visualizations.find(
      (v) => v.id === state.baseVisualizationId
    );
    if (!baseViz) {
      disable();
      return;
    }

    const generatedVisualizations = state.generatedVisualizationIds
      .map((id) =>
        visualizationStore.visualizations.find(
          (visualization) => visualization.id === id
        )
      )
      .filter((visualization): visualization is VisualizationConfig =>
        Boolean(visualization)
      );

    if (
      generatedVisualizations.length !== state.generatedVisualizationIds.length
    ) {
      return;
    }

    try {
      for (const [index, visualization] of generatedVisualizations.entries()) {
        const variable =
          getFacetSlotVariable(visualization, primarySlotPath) ??
          state.variables[index];
        if (!variable) {
          continue;
        }

        visualizationStore.updateVisualization(
          visualization.id,
          await buildFacetVisualizationUpdates({
            baseViz,
            visualization: baseViz,
            variable,
            scaleMode: state.scaleMode,
            primarySlotPath
          })
        );
      }

      notifyPersistence();
    } catch (error) {
      logger.error(
        'Failed to sync generated facet visualizations',
        LogCategory.STORE,
        error
      );
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
    state.primarySlotPath = null;
    state.variables = [];
    state.generatedVisualizationIds = [];
    state.facetTitles = {};
    notifyPersistence();
  }

  function setVariables(variables: string[]): void {
    state.variables = [...variables];
    notifyPersistence();
  }

  function getFacetTitle(variable: string): string | undefined {
    return state.facetTitles[variable];
  }

  function setFacetTitle(variable: string, title: string): void {
    if (!variable) {
      return;
    }

    const trimmed = title.trim();
    const isDefaultTitle = trimmed.length === 0 || trimmed === variable;

    if (isDefaultTitle) {
      if (variable in state.facetTitles) {
        const { [variable]: _removed, ...rest } = state.facetTitles;
        state.facetTitles = rest;
        notifyPersistence();
      }
      return;
    }

    if (state.facetTitles[variable] === trimmed) {
      return;
    }

    state.facetTitles = { ...state.facetTitles, [variable]: trimmed };
    notifyPersistence();
  }

  function capturePreviousGeneratedName(): string | undefined {
    const previousSelectedId = visualizationStore.selectedVisualization?.id;
    if (!previousSelectedId) return undefined;
    if (!state.generatedVisualizationIds.includes(previousSelectedId))
      return undefined;
    return visualizationStore.visualizations.find(
      (v) => v.id === previousSelectedId
    )?.name;
  }

  function restoreSelectionByName(
    newConfigs: VisualizationConfig[],
    previousName: string | undefined
  ): void {
    if (!previousName) return;
    const match = newConfigs.find((c) => c.name === previousName);
    if (match) visualizationStore.selectVisualization(match.id);
  }

  async function updateVariables(
    baseVizId: string,
    variables: string[],
    primarySlotPath: FacetSlotPath = state.primarySlotPath ??
      FACET_SLOT.POLYGON_VALUE
  ): Promise<void> {
    const baseViz = visualizationStore.visualizations.find(
      (v) => v.id === baseVizId
    );
    if (!baseViz) {
      return;
    }

    if (!state.enabled || state.baseVisualizationId !== baseVizId) {
      await enable(baseVizId, variables, primarySlotPath);
      return;
    }

    const compatible = filterCompatibleFacetVariables(
      baseViz,
      variables,
      primarySlotPath
    );
    if (compatible.length < 2) {
      if (state.enabled) {
        disable();
      }
      return;
    }

    const capped = compatible.slice(0, MAX_FACETS);

    if (
      state.primarySlotPath === primarySlotPath &&
      arraysEqual(state.variables, capped)
    ) {
      return;
    }

    isRegenerating = true;
    try {
      const previousName = capturePreviousGeneratedName();

      const newConfigs = await generateFacetVisualizations(
        baseViz,
        capped,
        state.scaleMode,
        primarySlotPath
      );
      visualizationStore.removeBulkVisualizations(
        state.generatedVisualizationIds
      );
      visualizationStore.createBulkVisualizations(newConfigs);
      state.primarySlotPath = primarySlotPath;
      state.variables = [...capped];
      state.generatedVisualizationIds = newConfigs.map((config) => config.id);
      state.layout.columns = computeBestColumns(capped.length);
      restoreSelectionByName(newConfigs, previousName);

      notifyPersistence();
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
    slotPath: FacetSlotPath,
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

    const baseViz = state.baseVisualizationId
      ? visualizationStore.visualizations.find(
          (item) => item.id === state.baseVisualizationId
        )
      : undefined;
    if (
      baseViz &&
      !isFacetVariableCompatible(baseViz, variableName, slotPath)
    ) {
      return false;
    }

    visualizationStore.updateVisualization(
      vizId,
      applyFacetVariableToVisualization(viz, slotPath, variableName)
    );
    notifyPersistence();
    return true;
  }

  async function reorderVariables(
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    if (fromIndex === toIndex) return;

    const nextVariables = reorderItems(state.variables, fromIndex, toIndex);
    const nextGeneratedIds = reorderItems(
      state.generatedVisualizationIds,
      fromIndex,
      toIndex
    );

    state.variables = nextVariables;

    if (state.enabled && canReorderGeneratedFacets(nextGeneratedIds)) {
      applyGeneratedFacetOrder(nextGeneratedIds);
      state.generatedVisualizationIds = nextGeneratedIds;
    }

    notifyPersistence();
  }

  function setColumns(columns: number): void {
    state.layout.columns = columns;
    notifyPersistence();
  }

  function setGap(gap: number): void {
    state.layout.gap = gap;
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
          const primarySlotPath =
            state.primarySlotPath ?? FACET_SLOT.POLYGON_VALUE;
          const generatedVisualizations = state.generatedVisualizationIds
            .map((id) =>
              visualizationStore.visualizations.find(
                (visualization) => visualization.id === id
              )
            )
            .filter((visualization): visualization is VisualizationConfig =>
              Boolean(visualization)
            );
          let nextGeneratedIds = state.generatedVisualizationIds;

          if (
            generatedVisualizations.length ===
            state.generatedVisualizationIds.length
          ) {
            for (const [
              index,
              visualization
            ] of generatedVisualizations.entries()) {
              const variable = state.variables[index];
              if (!variable) {
                continue;
              }

              visualizationStore.updateVisualization(
                visualization.id,
                await buildFacetVisualizationUpdates({
                  baseViz,
                  visualization,
                  variable,
                  scaleMode: newMode,
                  primarySlotPath
                })
              );
            }

            nextGeneratedIds = generatedVisualizations.map(
              (visualization) => visualization.id
            );
          } else {
            const previousName = capturePreviousGeneratedName();
            const newConfigs = await generateFacetVisualizations(
              baseViz,
              state.variables,
              newMode,
              primarySlotPath
            );

            visualizationStore.removeBulkVisualizations(
              state.generatedVisualizationIds
            );
            visualizationStore.createBulkVisualizations(newConfigs);
            nextGeneratedIds = newConfigs.map((config) => config.id);
            restoreSelectionByName(newConfigs, previousName);
          }

          state.generatedVisualizationIds = nextGeneratedIds;
          notifyPersistence();
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
    get primarySlotPath() {
      return state.primarySlotPath;
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
    get generatedVisualizationIds() {
      return state.generatedVisualizationIds;
    },
    get facetTitles() {
      return state.facetTitles;
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
    getFacetTitle,
    setFacetTitle,
    syncGeneratedVisualizationsFromBase,
    restoreFromSerialized,
    restoreGeneratedVisualizations
  };
}

export const facetsStore = createFacetsStore();

persistenceRegistry.register({
  key: 'facets',
  serialize: () => ({
    enabled: facetsStore.enabled,
    baseVisualizationId: facetsStore.baseVisualizationId,
    primarySlotPath: facetsStore.primarySlotPath,
    variables: [...facetsStore.variables],
    layout: { ...facetsStore.layout },
    scaleMode: facetsStore.scaleMode,
    generatedVisualizationIds: [...facetsStore.generatedVisualizationIds],
    facetTitles: { ...facetsStore.facetTitles }
  }),
  deserialize: (data: unknown) => facetsStore.restoreFromSerialized(data),
  reset: () => facetsStore.restoreFromSerialized(undefined),
  priority: 'debounced'
});
