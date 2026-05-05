import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  buildFacetVisualizationUpdates,
  generateFacetVisualizations
} from '$lib/features/commons/utils/facet-generator';

export const SCALE_MODE = {
  SHARED: 'shared',
  INDEPENDENT: 'independent'
} as const;

export const MAX_FACETS_COLUMNS = 4;
export const MAX_FACETS = 16;

export const FACET_SLOT = {
  SYMBOL_VALUE: 'symbol.valueColumn',
  SYMBOL_CATEGORY: 'symbol.categoryColumn',
  SYMBOL_SIZE: 'symbol.sizeColumn',
  SYMBOL_FILL_VALUE: 'symbol.fillValueColumn',
  SYMBOL_FILL_CATEGORY: 'symbol.fillCategoryColumn',
  POLYGON_VALUE: 'polygon.valueColumn',
  POLYGON_CATEGORY: 'polygon.categoryColumn',
  LINE_VALUE: 'line.valueColumn',
  LINE_CATEGORY: 'line.categoryColumn',
  LINE_SIZE: 'line.sizeColumn',
  TEXT_VALUE: 'text.valueColumn',
  TEXT_CATEGORY: 'text.categoryColumn',
  TEXT_BACKGROUND_VALUE: 'text.background.valueColumn',
  TEXT_BACKGROUND_CATEGORY: 'text.background.categoryColumn',
  TEXT_BACKGROUND_STROKE_VALUE: 'text.background.strokeValueColumn',
  TEXT_BACKGROUND_STROKE_CATEGORY: 'text.background.strokeCategoryColumn'
} as const;

export type FacetSlotPath = (typeof FACET_SLOT)[keyof typeof FACET_SLOT];

function isFacetSlotPath(value: unknown): value is FacetSlotPath {
  return (Object.values(FACET_SLOT) as string[]).includes(value as string);
}

function resolveFacetMappingKey(
  slotPath: FacetSlotPath
): keyof NonNullable<VisualizationConfig['mapping']> {
  if (slotPath.endsWith('.categoryColumn')) {
    return 'categoryColumn';
  }
  if (slotPath.endsWith('.sizeColumn')) {
    return 'sizeColumn';
  }
  return 'valueColumn';
}

function slotRequiresNumericVariable(slotPath: FacetSlotPath): boolean {
  return slotPath.endsWith('.valueColumn') || slotPath.endsWith('.sizeColumn');
}

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
    .filter(
      (column) =>
        !slotRequiresNumericVariable(slotPath) || column.type === 'number'
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
  if (!slotRequiresNumericVariable(slotPath)) {
    return sanitized;
  }

  const dataset = datasetsStore.datasets.find(
    (candidate) => candidate.id === visualization.datasetId
  );
  if (!dataset?.columns?.length) {
    return sanitized;
  }

  const numericColumns = new Set(
    dataset.columns
      .filter((column) => column.type === 'number')
      .map((column) => column.name)
  );

  return sanitized.filter((variable) => numericColumns.has(variable));
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
  if (compatible.length >= 2 || !slotRequiresNumericVariable(slotPath)) {
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
  const mappingKey = resolveFacetMappingKey(slotPath);
  const nextMapping = {
    ...visualization.mapping,
    [mappingKey]: variableName
  };

  switch (slotPath) {
    case FACET_SLOT.SYMBOL_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_SIZE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                sizeColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_FILL_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                fillValueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_FILL_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                fillCategoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.POLYGON_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.polygon
          ? {
              polygon: {
                ...visualization.polygon,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.POLYGON_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.polygon
          ? {
              polygon: {
                ...visualization.polygon,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.LINE_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.line
          ? {
              line: {
                ...visualization.line,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.LINE_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.line
          ? {
              line: {
                ...visualization.line,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.LINE_SIZE:
      return {
        mapping: nextMapping,
        ...(visualization.line
          ? {
              line: {
                ...visualization.line,
                sizeColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.text
          ? {
              text: {
                ...visualization.text,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.text
          ? {
              text: {
                ...visualization.text,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_BACKGROUND_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.text?.background
          ? {
              text: {
                ...visualization.text,
                background: {
                  ...visualization.text.background,
                  valueColumn: variableName
                }
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_BACKGROUND_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.text?.background
          ? {
              text: {
                ...visualization.text,
                background: {
                  ...visualization.text.background,
                  categoryColumn: variableName
                }
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.text?.background
          ? {
              text: {
                ...visualization.text,
                background: {
                  ...visualization.text.background,
                  strokeValueColumn: variableName
                }
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.text?.background
          ? {
              text: {
                ...visualization.text,
                background: {
                  ...visualization.text.background,
                  strokeCategoryColumn: variableName
                }
              }
            }
          : {})
      };
  }
}

export function computeBestColumns(
  mapCount: number,
  maxCols: number = MAX_FACETS_COLUMNS
): number {
  if (mapCount <= 1) return 1;
  if (mapCount === 2) return 2;
  if (mapCount === 3) return 3;
  if (mapCount === 4) return 2;
  return Math.min(maxCols, Math.ceil(Math.sqrt(mapCount)));
}

export type ScaleMode = (typeof SCALE_MODE)[keyof typeof SCALE_MODE];

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
  scaleMode: SCALE_MODE.INDEPENDENT,
  generatedVisualizationIds: []
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
      disable();
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

    try {
      const facetConfigs = await generateFacetVisualizations(
        baseViz,
        capped,
        state.scaleMode,
        primarySlotPath
      );

      visualizationStore.createBulkVisualizations(facetConfigs);

      state.enabled = true;
      state.baseVisualizationId = baseVizId;
      state.primarySlotPath = primarySlotPath;
      state.variables = [...capped];
      state.generatedVisualizationIds = facetConfigs.map((c) => c.id);
      state.layout.columns = computeBestColumns(capped.length);
      notifyPersistence();
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
    state.primarySlotPath = null;
    state.variables = [];
    state.generatedVisualizationIds = [];
    notifyPersistence();
  }

  function setVariables(variables: string[]): void {
    state.variables = [...variables];
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
            generatedVisualizations.forEach((visualization, index) => {
              const variable = state.variables[index];
              if (!variable) {
                return;
              }

              visualizationStore.updateVisualization(
                visualization.id,
                buildFacetVisualizationUpdates({
                  baseViz,
                  visualization,
                  variable,
                  scaleMode: newMode,
                  primarySlotPath
                })
              );
            });

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
    restoreFromSerialized
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
    generatedVisualizationIds: [...facetsStore.generatedVisualizationIds]
  }),
  deserialize: (data: unknown) => facetsStore.restoreFromSerialized(data),
  reset: () => facetsStore.restoreFromSerialized(undefined),
  priority: 'debounced'
});
