import {
  SavePriority,
  persistenceRegistry,
  type SavePriorityType
} from '$lib/features/project-management/core';
import {
  FillMode,
  VisualizationType,
  VISUALIZATION_DEFAULTS,
  DEFAULT_DISCRETIZATION_CLASS_COUNT
} from '$lib/features/commons/constants/visualization.constants';
import { deepClone } from '../utils/clone.utils';
import { DataValidationError } from '../pipeline.errors';
import { generateUniqueNameWithCounter } from '../utils/naming.utils';
import { sanitizeTextInput } from '../utils/sanitize.utils';
import { datasetsStore } from './datasets.store.svelte';
import { analyticsService } from '../services/analytics.service';
import { findById, updateById } from '../utils/array-helpers';
import * as m from '$lib/paraglide/messages';

import {
  ALL_PRIMITIVE_FILTERS,
  ClassificationMethod,
  PrimitiveFilterType,
  type ClassificationConfig,
  type LinePrimitiveConfig,
  type MissingDataConfig,
  type PolygonPrimitiveConfig,
  type PrimitiveConfigKind,
  type PrimitiveConfigMap,
  type PrimitiveFilter,
  type SymbolPrimitiveConfig,
  type TextBackgroundConfig,
  type TextPrimitiveConfig,
  type VisualizationConfig,
  type VisualizationModes,
  type VisualizationOrigin,
  type VisualizationRestoreSnapshot,
  type VisualizationState,
  type VizDataFilter
} from './visualization.types';
export {
  ALL_PRIMITIVE_FILTERS,
  ClassificationMethod,
  getVisualizationOriginMode,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from './visualization.types';
export type {
  ClassificationConfig,
  LineColorModeState,
  LinePrimitiveConfig,
  LineThicknessModeState,
  MissingDataConfig,
  PolygonPrimitiveConfig,
  PrimitiveConfigKind,
  PrimitiveFilter,
  SymbolModeState,
  SymbolPrimitiveConfig,
  TextBackgroundConfig,
  TextColorModeState,
  TextPrimitiveConfig,
  TextSecondaryLabelsConfig,
  TextSizeModeState,
  VisualizationAppliedSuggestionState,
  VisualizationConfig,
  VisualizationModes,
  VisualizationOrigin,
  VisualizationOriginMode,
  VisualizationPreset,
  VisualizationRestoreSnapshot,
  VisualizationRestoreState,
  VizDataFilter,
  VizFilterOperator
} from './visualization.types';

import {
  buildLinePrimitiveConfig,
  buildPolygonPrimitiveConfig,
  buildSymbolPrimitiveConfig,
  buildTextPrimitiveConfig,
  getPrimitive,
  normalizeVisualizationConfig,
  resolvePrimitiveKind
} from './visualization-normalize';
import {
  resolveDuplicatedVisualizationOrigin,
  resolveNextVisualizationOrigin
} from './visualization-origin';
import { buildVisualizationPreset } from './visualization-presets';
export {
  DEFAULT_CATEGORICAL_COLORS,
  resolveVisualizationPreset
} from './visualization-presets';
export {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  resolveAllowedPrimitiveFilters
} from './visualization-normalize';

interface SerializedVisualizationSettings {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: string[];
}

type VisualizationSymbols = NonNullable<VisualizationConfig['symbols']>;

export interface VisualizationStore {
  readonly version: number;
  readonly visualizations: VisualizationConfig[];
  readonly selectedVisualization: VisualizationConfig | undefined;
  readonly activeVisualizations: VisualizationConfig[];
  createVisualization: (
    type: VisualizationType,
    datasetId: string,
    name?: string
  ) => VisualizationConfig;
  updateModes: (id: string, modes: Partial<VisualizationModes>) => void;
  togglePrimitiveFilter: (id: string, primitive: PrimitiveFilter) => void;
  setPrimitiveFilterOrder: (id: string, order: PrimitiveFilter[]) => void;
  updateSymbols: (
    id: string,
    symbols: Partial<VisualizationConfig['symbols']>
  ) => void;
  updateMissingData: (
    id: string,
    missingData: Partial<MissingDataConfig>
  ) => void;
  updateClassification: (
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updatePrimitiveClassification: (
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updateLineThicknessClassification: (
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updatePrimitiveStrokeClassification: (
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updateVisualization: (
    id: string,
    updates: Partial<VisualizationConfig>,
    priority?: SavePriorityType
  ) => void;
  renameVisualization: (id: string, name: string) => void;
  applyVisualizationPreset: (id: string, type: VisualizationType) => void;
  duplicateVisualization: (
    id: string,
    targetDatasetId?: string
  ) => VisualizationConfig | null;
  removeVisualization: (id: string) => void;
  createBulkVisualizations: (configs: VisualizationConfig[]) => void;
  removeBulkVisualizations: (ids: string[]) => void;
  setVisualizationOrder: (orderedIds: string[]) => void;
  toggleVisualization: (id: string) => void;
  selectVisualization: (id: string) => void;
  invertPalette: (id: string) => void;
  getVisualizationsByDataset: (datasetId: string) => VisualizationConfig[];
  getVisualizationsUsingColumn: (
    datasetId: string,
    columnName: string
  ) => VisualizationConfig[];
  renameDatasetColumnReferences: (
    datasetId: string,
    previousName: string,
    nextName: string
  ) => void;
  removeDatasetColumnReferences: (
    datasetId: string,
    columnName: string
  ) => void;
  addDataFilter: (id: string, filter: Omit<VizDataFilter, 'id'>) => void;
  removeDataFilter: (id: string, filterId: string) => void;
  updateDataFilter: (
    id: string,
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ) => void;
  clearDataFilters: (id: string) => void;
  clearDataFiltersForPrimitive: (
    id: string,
    primitiveType: PrimitiveFilter
  ) => void;
  clear: () => void;
  restoreFromSerialized: (settings: SerializedVisualizationSettings) => void;
}

const getDefaultVisualizationName = () => m.default_visualization_name();
const getDatasetNotFoundError = () => m.dataset_not_found_error();

const VISUALIZATION_MAPPING_KEYS = [
  'valueColumn',
  'categoryColumn',
  'sizeColumn',
  'colorColumn',
  'geometryColumn',
  'labelColumn',
  'secondaryLabelColumn'
] as const;

const CLASSIFICATION_DEPENDENT_MAPPING_KEYS = new Set([
  'valueColumn',
  'categoryColumn',
  'sizeColumn',
  'colorColumn'
]);

type VisualizationMappingKey = (typeof VISUALIZATION_MAPPING_KEYS)[number];

function incrementVersion(
  state: VisualizationState,
  priority: SavePriorityType = SavePriority.DEBOUNCED
): void {
  state.version++;
  persistenceRegistry.notifyChange('visualization', priority);
}

function getNormalizedVisualization(
  visualization: VisualizationConfig
): VisualizationConfig {
  const dataset = findById(datasetsStore.datasets, visualization.datasetId);

  if (!dataset) {
    return visualization;
  }

  return normalizeVisualizationConfig(visualization, dataset);
}

function createVisualizationStore(): VisualizationStore {
  const state = $state<VisualizationState>({
    visualizations: [],
    activeVisualizationIds: new Set<string>(),
    version: 0
  });

  function updateActiveVisualizationIds(
    updater: (ids: Set<string>) => Set<string>
  ): void {
    state.activeVisualizationIds = updater(
      new Set(state.activeVisualizationIds)
    );
  }

  function getVisualizationById(id: string): VisualizationConfig | undefined {
    return findById(state.visualizations, id);
  }

  function applyVisualizationUpdate(
    id: string,
    resolveUpdates: (
      visualization: VisualizationConfig
    ) => Partial<VisualizationConfig> | null,
    priority: SavePriorityType = SavePriority.DEBOUNCED
  ): void {
    const visualization = getVisualizationById(id);
    if (!visualization) {
      return;
    }

    const updates = resolveUpdates(visualization);
    if (!updates) {
      return;
    }

    const nextOrigin = resolveNextVisualizationOrigin(visualization, updates);

    const nextVisualization = getNormalizedVisualization({
      ...visualization,
      ...updates,
      origin: nextOrigin,
      id
    });

    state.visualizations = updateById(
      state.visualizations,
      id,
      nextVisualization
    );
    incrementVersion(state, priority);
  }

  function createVisualization(
    type: VisualizationType,
    datasetId: string,
    name?: string
  ): VisualizationConfig {
    const dataset = findById(datasetsStore.datasets, datasetId);
    if (!dataset) {
      throw new DataValidationError(getDatasetNotFoundError(), 'datasetId', {
        datasetId
      });
    }

    const visualization = getNormalizedVisualization({
      id: crypto.randomUUID(),
      name:
        name ||
        generateUniqueNameWithCounter(
          getDefaultVisualizationName(),
          state.visualizations.map((item) => item.name)
        ),
      datasetId,
      enabled: true,
      ...buildVisualizationPreset(type, dataset)
    });

    state.visualizations.push(visualization);
    state.selectedVisualizationId = visualization.id;
    updateActiveVisualizationIds((ids) => ids.add(visualization.id));
    incrementVersion(state, SavePriority.IMMEDIATE);
    analyticsService.trackVisualizationCreated(type);

    return visualization;
  }

  function updateModes(id: string, modes: Partial<VisualizationModes>): void {
    applyVisualizationUpdate(id, (visualization) => ({
      modes: { ...visualization.modes, ...modes } as VisualizationModes
    }));
  }

  function togglePrimitiveFilter(id: string, primitive: PrimitiveFilter): void {
    applyVisualizationUpdate(id, (visualization) => {
      const currentFilters =
        visualization.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
      const willBeEnabled = !currentFilters.includes(primitive);
      const nextFilters = willBeEnabled
        ? [...currentFilters, primitive]
        : currentFilters.filter((item) => item !== primitive);

      const update: Partial<VisualizationConfig> = {
        primitiveFilters: nextFilters
      };

      switch (primitive) {
        case PrimitiveFilterType.POINT: {
          const symbol = buildSymbolPrimitiveConfig(visualization);
          update.symbol = {
            ...symbol,
            enabled: willBeEnabled,
            opacity:
              willBeEnabled && (symbol.opacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.symbolOpacity / 100
                : symbol.opacity
          };
          break;
        }
        case PrimitiveFilterType.LINE: {
          const line = buildLinePrimitiveConfig(visualization);
          update.line = {
            ...line,
            enabled: willBeEnabled,
            opacity:
              willBeEnabled && (line.opacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.lineOpacity / 100
                : line.opacity
          };
          break;
        }
        case PrimitiveFilterType.POLYGON: {
          const polygon = buildPolygonPrimitiveConfig(visualization);
          update.polygon = {
            ...polygon,
            enabled: willBeEnabled,
            fillOpacity:
              willBeEnabled &&
              polygon.fillMode !== FillMode.NONE &&
              (polygon.fillOpacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.fillOpacity / 100
                : polygon.fillOpacity
          };
          break;
        }
        case PrimitiveFilterType.TEXT: {
          const text = buildTextPrimitiveConfig(visualization);
          update.text = {
            ...text,
            enabled: willBeEnabled,
            opacity:
              willBeEnabled && (text.opacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.textOpacity / 100
                : text.opacity
          };
          break;
        }
      }

      return update;
    });
  }

  function setPrimitiveFilterOrder(id: string, order: PrimitiveFilter[]): void {
    applyVisualizationUpdate(id, () => ({
      primitiveOrder: order
    }));
  }

  function updateSymbols(
    id: string,
    symbolUpdates: Partial<VisualizationConfig['symbols']>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.symbols) {
        return null;
      }

      return {
        symbols: {
          ...visualization.symbols,
          ...(symbolUpdates as Partial<VisualizationSymbols>)
        },
        symbol: {
          ...buildSymbolPrimitiveConfig(visualization),
          ...(symbolUpdates?.type ? { shape: symbolUpdates.type } : {}),
          ...(symbolUpdates?.size !== undefined
            ? { size: symbolUpdates.size }
            : {}),
          ...(symbolUpdates?.minSize !== undefined
            ? { minSize: symbolUpdates.minSize }
            : {}),
          ...(symbolUpdates?.maxSize !== undefined
            ? { maxSize: symbolUpdates.maxSize }
            : {}),
          ...(symbolUpdates?.barWidth !== undefined
            ? { barWidth: symbolUpdates.barWidth }
            : {}),
          ...(symbolUpdates?.sizeScale !== undefined
            ? { sizeScale: symbolUpdates.sizeScale }
            : {}),
          ...(symbolUpdates?.opacity !== undefined
            ? { opacity: symbolUpdates.opacity }
            : {})
        }
      };
    });
  }

  function updateMissingData(
    id: string,
    missingData: Partial<MissingDataConfig>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.missingData) {
        return null;
      }

      return {
        missingData: { ...visualization.missingData, ...missingData },
        polygon: {
          ...buildPolygonPrimitiveConfig(visualization),
          missingData: {
            ...buildPolygonPrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        },
        symbol: {
          ...buildSymbolPrimitiveConfig(visualization),
          missingData: {
            ...buildSymbolPrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        },
        line: {
          ...buildLinePrimitiveConfig(visualization),
          missingData: {
            ...buildLinePrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        },
        text: {
          ...buildTextPrimitiveConfig(visualization),
          missingData: {
            ...buildTextPrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        }
      };
    });
  }

  function updateClassification(
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const existing = visualization.classification ?? {
        method: ClassificationMethod.KMEANS,
        classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
      };

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        classification: { ...existing, ...classification },
        polygon: {
          ...buildPolygonPrimitiveConfig(visualization),
          classification: {
            ...buildPolygonPrimitiveConfig(visualization).classification,
            ...classification
          } as ClassificationConfig
        }
      };
    });
  }

  function updatePrimitiveClassification(
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    const targetKey = (
      {
        [PrimitiveFilterType.POINT]: 'symbolClassification',
        [PrimitiveFilterType.LINE]: 'lineClassification',
        [PrimitiveFilterType.TEXT]: 'textClassification',
        [PrimitiveFilterType.POLYGON]: 'classification'
      } as const
    )[primitive];

    applyVisualizationUpdate(id, (visualization) => {
      const fallback = visualization.classification ?? {
        method: ClassificationMethod.KMEANS,
        classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
      };
      const existing =
        (visualization[targetKey] as ClassificationConfig | undefined) ??
        fallback;
      const primitiveConfig = getPrimitive(
        visualization,
        primitive
      ) as PrimitiveConfigMap[PrimitiveConfigKind];
      const primitiveKind = resolvePrimitiveKind(primitive);

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        [targetKey]: { ...existing, ...classification },
        [primitiveKind]: {
          ...primitiveConfig,
          classification: {
            ...primitiveConfig.classification,
            ...classification
          } as ClassificationConfig
        }
      } as Partial<VisualizationConfig>;
    });
  }

  function updateLineThicknessClassification(
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const line = buildLinePrimitiveConfig(visualization);
      const existing = visualization.lineThicknessClassification ??
        line.thicknessClassification ??
        line.classification ??
        visualization.lineClassification ??
        visualization.classification ?? {
          method: ClassificationMethod.KMEANS,
          classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
        };

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        lineThicknessClassification: { ...existing, ...classification },
        line: {
          ...line,
          thicknessClassification: {
            ...line.thicknessClassification,
            ...classification
          } as ClassificationConfig
        }
      } as Partial<VisualizationConfig>;
    });
  }

  function updatePrimitiveStrokeClassification(
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const primitiveConfig = getPrimitive(
        visualization,
        primitive
      ) as PrimitiveConfigMap[PrimitiveConfigKind];
      const primitiveKind = resolvePrimitiveKind(primitive);
      const existing =
        (
          primitiveConfig as unknown as {
            strokeClassification?: ClassificationConfig;
          }
        ).strokeClassification ??
        ({
          method: ClassificationMethod.KMEANS,
          classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
        } as ClassificationConfig);

      const merged = {
        ...existing,
        ...classification
      } as ClassificationConfig;

      const nextPrimitive = {
        ...primitiveConfig,
        strokeClassification: merged
      };

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        [primitiveKind]: nextPrimitive
      } as Partial<VisualizationConfig>;
    });
  }

  function updateVisualization(
    id: string,
    updates: Partial<VisualizationConfig>,
    priority?: SavePriorityType
  ): void {
    applyVisualizationUpdate(id, () => updates, priority);
  }

  function renameVisualization(id: string, name: string): void {
    applyVisualizationUpdate(
      id,
      (visualization) => {
        const sanitizedName = sanitizeTextInput(name);
        if (!sanitizedName || sanitizedName === visualization.name) {
          return null;
        }

        return { name: sanitizedName };
      },
      SavePriority.IMMEDIATE
    );
  }

  function applyVisualizationPreset(id: string, type: VisualizationType): void {
    applyVisualizationUpdate(id, (visualization) => {
      const dataset = findById(datasetsStore.datasets, visualization.datasetId);
      if (!dataset) {
        return null;
      }

      const preset = buildVisualizationPreset(type, dataset);

      return {
        ...preset,
        primitiveOrder: undefined,
        dataFilters: undefined
      };
    });
  }

  function duplicateVisualization(
    id: string,
    targetDatasetId?: string
  ): VisualizationConfig | null {
    const original = getVisualizationById(id);
    if (!original) {
      return null;
    }

    const duplicatedName = generateUniqueNameWithCounter(
      original.name,
      state.visualizations.map((item) => item.name)
    );

    const duplicatedVisualization = getNormalizedVisualization({
      ...deepClone(original),
      id: crypto.randomUUID(),
      name: duplicatedName,
      origin: resolveDuplicatedVisualizationOrigin(original.origin),
      ...(targetDatasetId ? { datasetId: targetDatasetId } : {})
    });

    state.visualizations.push(duplicatedVisualization);
    state.selectedVisualizationId = duplicatedVisualization.id;
    updateActiveVisualizationIds((ids) => ids.add(duplicatedVisualization.id));
    incrementVersion(state, SavePriority.IMMEDIATE);

    return duplicatedVisualization;
  }

  function removeVisualization(id: string): void {
    const remainingVisualizations = state.visualizations.filter(
      (visualization) => visualization.id !== id
    );

    updateActiveVisualizationIds((ids) => {
      ids.delete(id);
      return ids;
    });

    if (state.selectedVisualizationId === id) {
      state.selectedVisualizationId = remainingVisualizations[0]?.id;
    }

    state.visualizations = remainingVisualizations;
    incrementVersion(state, SavePriority.IMMEDIATE);
  }

  function createBulkVisualizations(configs: VisualizationConfig[]): void {
    if (configs.length === 0) {
      return;
    }

    configs.forEach((config) => {
      const normalizedConfig = getNormalizedVisualization(config);
      state.visualizations.push(normalizedConfig);
      updateActiveVisualizationIds((ids) => ids.add(normalizedConfig.id));
    });

    incrementVersion(state, SavePriority.IMMEDIATE);
  }

  function removeBulkVisualizations(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }

    const idsSet = new Set(ids);
    const remainingVisualizations = state.visualizations.filter(
      (visualization) => !idsSet.has(visualization.id)
    );

    updateActiveVisualizationIds((activeIds) => {
      ids.forEach((idToRemove) => {
        activeIds.delete(idToRemove);
      });
      return activeIds;
    });

    if (
      state.selectedVisualizationId &&
      idsSet.has(state.selectedVisualizationId)
    ) {
      state.selectedVisualizationId = remainingVisualizations[0]?.id;
    }

    state.visualizations = remainingVisualizations;
    incrementVersion(state, SavePriority.IMMEDIATE);
  }

  function setVisualizationOrder(orderedIds: string[]): void {
    if (orderedIds.length === 0) {
      return;
    }

    const orderedVisualizations: VisualizationConfig[] = [];
    const orderedIdsSet = new Set(orderedIds);

    orderedIds.forEach((id) => {
      const visualization = getVisualizationById(id);
      if (visualization) {
        orderedVisualizations.push(visualization);
      }
    });

    if (orderedVisualizations.length === 0) {
      return;
    }

    const remainingVisualizations = state.visualizations.filter(
      (visualization) => !orderedIdsSet.has(visualization.id)
    );

    state.visualizations = [
      ...orderedVisualizations,
      ...remainingVisualizations
    ];
    incrementVersion(state);
  }

  function toggleVisualization(id: string): void {
    updateActiveVisualizationIds((ids) => {
      if (ids.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
      return ids;
    });
    incrementVersion(state);
  }

  function selectVisualization(id: string): void {
    if (!getVisualizationById(id) || state.selectedVisualizationId === id) {
      return;
    }
    state.selectedVisualizationId = id;
    incrementVersion(state);
  }

  function invertPalette(id: string): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.classification?.colors) {
        return null;
      }

      const inverted = !(visualization.classification.inverted ?? false);

      return {
        classification: {
          ...visualization.classification,
          colors: [...visualization.classification.colors].reverse(),
          inverted
        }
      };
    });
  }

  function getVisualizationsByDataset(
    datasetId: string
  ): VisualizationConfig[] {
    return state.visualizations.filter(
      (visualization) => visualization.datasetId === datasetId
    );
  }

  function someLineModeStateUsesColumn(
    line: LinePrimitiveConfig | undefined,
    columnName: string
  ): boolean {
    if (!line || !columnName) {
      return false;
    }

    return (
      Object.values(line.colorModeStates ?? {}).some(
        (state) =>
          state?.valueColumn === columnName ||
          state?.categoryColumn === columnName
      ) ||
      Object.values(line.thicknessModeStates ?? {}).some(
        (state) =>
          state?.valueColumn === columnName || state?.sizeColumn === columnName
      )
    );
  }

  function renameLineModeStateColumns(
    line: LinePrimitiveConfig,
    renameColumn: (value?: string) => string | undefined
  ): void {
    if (line.colorModeStates) {
      line.colorModeStates = Object.fromEntries(
        Object.entries(line.colorModeStates).map(([mode, state]) => [
          mode,
          state
            ? {
                ...state,
                valueColumn: renameColumn(state.valueColumn),
                categoryColumn: renameColumn(state.categoryColumn)
              }
            : state
        ])
      ) as NonNullable<LinePrimitiveConfig['colorModeStates']>;
    }

    if (line.thicknessModeStates) {
      line.thicknessModeStates = Object.fromEntries(
        Object.entries(line.thicknessModeStates).map(([mode, state]) => [
          mode,
          state
            ? {
                ...state,
                valueColumn: renameColumn(state.valueColumn),
                sizeColumn: renameColumn(state.sizeColumn)
              }
            : state
        ])
      ) as NonNullable<LinePrimitiveConfig['thicknessModeStates']>;
    }
  }

  function removeLineModeStateColumns(
    line: LinePrimitiveConfig,
    columnName: string,
    clearColumn: (value?: string) => string | undefined
  ): void {
    if (line.colorModeStates) {
      line.colorModeStates = Object.fromEntries(
        Object.entries(line.colorModeStates).map(([mode, state]) => {
          if (!state) {
            return [mode, state];
          }

          const clearsClassification =
            state.valueColumn === columnName ||
            state.categoryColumn === columnName;

          return [
            mode,
            {
              ...state,
              valueColumn: clearColumn(state.valueColumn),
              categoryColumn: clearColumn(state.categoryColumn),
              ...(clearsClassification ? { classification: undefined } : {})
            }
          ];
        })
      ) as NonNullable<LinePrimitiveConfig['colorModeStates']>;
    }

    if (line.thicknessModeStates) {
      line.thicknessModeStates = Object.fromEntries(
        Object.entries(line.thicknessModeStates).map(([mode, state]) => {
          if (!state) {
            return [mode, state];
          }

          return [
            mode,
            {
              ...state,
              valueColumn: clearColumn(state.valueColumn),
              sizeColumn: clearColumn(state.sizeColumn),
              ...(state.valueColumn === columnName
                ? { thicknessClassification: undefined }
                : {})
            }
          ];
        })
      ) as NonNullable<LinePrimitiveConfig['thicknessModeStates']>;
    }
  }

  function getVisualizationsUsingColumn(
    datasetId: string,
    columnName: string
  ): VisualizationConfig[] {
    return state.visualizations.filter((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return false;
      }

      const mapping = visualization.mapping;
      const polygon = buildPolygonPrimitiveConfig(visualization);
      const symbol = buildSymbolPrimitiveConfig(visualization);
      const line = buildLinePrimitiveConfig(visualization);
      const text = buildTextPrimitiveConfig(visualization);

      return (
        mapping.valueColumn === columnName ||
        mapping.categoryColumn === columnName ||
        mapping.sizeColumn === columnName ||
        mapping.colorColumn === columnName ||
        mapping.geometryColumn === columnName ||
        mapping.labelColumn === columnName ||
        mapping.secondaryLabelColumn === columnName ||
        polygon.valueColumn === columnName ||
        polygon.categoryColumn === columnName ||
        symbol.valueColumn === columnName ||
        symbol.categoryColumn === columnName ||
        symbol.sizeColumn === columnName ||
        symbol.fillValueColumn === columnName ||
        symbol.fillCategoryColumn === columnName ||
        line.valueColumn === columnName ||
        line.categoryColumn === columnName ||
        line.sizeColumn === columnName ||
        someLineModeStateUsesColumn(line, columnName) ||
        text.labelColumn === columnName ||
        text.valueColumn === columnName ||
        text.categoryColumn === columnName ||
        text.secondaryLabels.labelColumn === columnName ||
        (visualization.dataFilters ?? []).some(
          (filter) => filter.column === columnName
        )
      );
    });
  }

  function renameDatasetColumnReferences(
    datasetId: string,
    previousName: string,
    nextName: string
  ): void {
    if (!previousName || !nextName || previousName === nextName) {
      return;
    }

    let hasChanges = false;

    state.visualizations = state.visualizations.map((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return visualization;
      }

      let mutated = false;
      const nextMapping = { ...visualization.mapping };
      const nextPolygon = buildPolygonPrimitiveConfig(visualization);
      const nextSymbol = buildSymbolPrimitiveConfig(visualization);
      const nextLine = buildLinePrimitiveConfig(visualization);
      const nextText = buildTextPrimitiveConfig(visualization);
      for (const key of VISUALIZATION_MAPPING_KEYS) {
        if (nextMapping[key as VisualizationMappingKey] === previousName) {
          nextMapping[key as VisualizationMappingKey] = nextName;
          mutated = true;
        }
      }

      const renameColumn = (value?: string): string | undefined => {
        if (value !== previousName) {
          return value;
        }
        mutated = true;
        return nextName;
      };

      nextPolygon.valueColumn = renameColumn(nextPolygon.valueColumn);
      nextPolygon.categoryColumn = renameColumn(nextPolygon.categoryColumn);
      nextSymbol.valueColumn = renameColumn(nextSymbol.valueColumn);
      nextSymbol.categoryColumn = renameColumn(nextSymbol.categoryColumn);
      nextSymbol.sizeColumn = renameColumn(nextSymbol.sizeColumn);
      nextSymbol.fillValueColumn = renameColumn(nextSymbol.fillValueColumn);
      nextSymbol.fillCategoryColumn = renameColumn(
        nextSymbol.fillCategoryColumn
      );
      nextLine.valueColumn = renameColumn(nextLine.valueColumn);
      nextLine.categoryColumn = renameColumn(nextLine.categoryColumn);
      nextLine.sizeColumn = renameColumn(nextLine.sizeColumn);
      renameLineModeStateColumns(nextLine, renameColumn);
      nextText.labelColumn = renameColumn(nextText.labelColumn);
      nextText.valueColumn = renameColumn(nextText.valueColumn);
      nextText.categoryColumn = renameColumn(nextText.categoryColumn);
      nextText.secondaryLabels = {
        ...nextText.secondaryLabels,
        labelColumn: renameColumn(nextText.secondaryLabels.labelColumn)
      };

      const previousDataFilters = visualization.dataFilters ?? [];
      const nextDataFilters = previousDataFilters.map((filter) =>
        filter.column === previousName
          ? { ...filter, column: nextName }
          : filter
      );
      if (
        nextDataFilters.some(
          (filter, index) => filter !== previousDataFilters[index]
        )
      ) {
        mutated = true;
      }

      if (!mutated) {
        return visualization;
      }

      hasChanges = true;
      return getNormalizedVisualization({
        ...visualization,
        polygon: nextPolygon,
        symbol: nextSymbol,
        line: nextLine,
        text: nextText,
        mapping: nextMapping,
        dataFilters: nextDataFilters
      });
    });

    if (hasChanges) {
      incrementVersion(state);
    }
  }

  function removeDatasetColumnReferences(
    datasetId: string,
    columnName: string
  ): void {
    if (!columnName) {
      return;
    }

    let hasChanges = false;

    state.visualizations = state.visualizations.map((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return visualization;
      }

      let mutated = false;
      let shouldClearClassification = false;
      const nextMapping = { ...visualization.mapping };
      const nextPolygon = buildPolygonPrimitiveConfig(visualization);
      const nextSymbol = buildSymbolPrimitiveConfig(visualization);
      const nextLine = buildLinePrimitiveConfig(visualization);
      const nextText = buildTextPrimitiveConfig(visualization);
      for (const key of VISUALIZATION_MAPPING_KEYS) {
        if (nextMapping[key as VisualizationMappingKey] === columnName) {
          nextMapping[key as VisualizationMappingKey] = undefined;
          mutated = true;
          if (CLASSIFICATION_DEPENDENT_MAPPING_KEYS.has(key)) {
            shouldClearClassification = true;
          }
        }
      }

      const clearColumn = (value?: string): string | undefined => {
        if (value !== columnName) {
          return value;
        }
        mutated = true;
        return undefined;
      };

      const clearClassificationForColumn = (
        primitiveValue: string | undefined,
        primitiveCategory: string | undefined,
        primitiveSize?: string
      ): boolean =>
        primitiveValue === columnName ||
        primitiveCategory === columnName ||
        primitiveSize === columnName;

      const hadPolygonClassificationDependency = clearClassificationForColumn(
        nextPolygon.valueColumn,
        nextPolygon.categoryColumn
      );
      nextPolygon.valueColumn = clearColumn(nextPolygon.valueColumn);
      nextPolygon.categoryColumn = clearColumn(nextPolygon.categoryColumn);
      if (hadPolygonClassificationDependency) {
        nextPolygon.classification = undefined;
      }

      const hadSymbolClassificationDependency = clearClassificationForColumn(
        nextSymbol.valueColumn,
        nextSymbol.categoryColumn,
        nextSymbol.sizeColumn
      );
      const hadSymbolFillClassificationDependency =
        clearClassificationForColumn(
          nextSymbol.fillValueColumn,
          nextSymbol.fillCategoryColumn
        );
      nextSymbol.valueColumn = clearColumn(nextSymbol.valueColumn);
      nextSymbol.categoryColumn = clearColumn(nextSymbol.categoryColumn);
      nextSymbol.sizeColumn = clearColumn(nextSymbol.sizeColumn);
      nextSymbol.fillValueColumn = clearColumn(nextSymbol.fillValueColumn);
      nextSymbol.fillCategoryColumn = clearColumn(
        nextSymbol.fillCategoryColumn
      );
      if (hadSymbolClassificationDependency) {
        nextSymbol.classification = undefined;
      }
      if (hadSymbolFillClassificationDependency) {
        nextSymbol.fillClassification = undefined;
      }

      const hadLineColorClassificationDependency =
        nextLine.valueColumn === columnName ||
        nextLine.categoryColumn === columnName;
      const hadLineThicknessClassificationDependency =
        nextLine.valueColumn === columnName;
      nextLine.valueColumn = clearColumn(nextLine.valueColumn);
      nextLine.categoryColumn = clearColumn(nextLine.categoryColumn);
      nextLine.sizeColumn = clearColumn(nextLine.sizeColumn);
      removeLineModeStateColumns(nextLine, columnName, clearColumn);
      if (hadLineColorClassificationDependency) {
        nextLine.classification = undefined;
      }
      if (hadLineThicknessClassificationDependency) {
        nextLine.thicknessClassification = undefined;
      }

      const hadTextClassificationDependency = clearClassificationForColumn(
        nextText.valueColumn,
        nextText.categoryColumn
      );
      nextText.labelColumn = clearColumn(nextText.labelColumn);
      nextText.valueColumn = clearColumn(nextText.valueColumn);
      nextText.categoryColumn = clearColumn(nextText.categoryColumn);
      nextText.secondaryLabels = {
        ...nextText.secondaryLabels,
        labelColumn: clearColumn(nextText.secondaryLabels.labelColumn)
      };
      if (hadTextClassificationDependency) {
        nextText.classification = undefined;
      }

      const previousDataFilters = visualization.dataFilters ?? [];
      const nextDataFilters = previousDataFilters.filter(
        (filter) => filter.column !== columnName
      );
      if (nextDataFilters.length !== previousDataFilters.length) {
        mutated = true;
      }

      if (!mutated) {
        return visualization;
      }

      hasChanges = true;
      return getNormalizedVisualization({
        ...visualization,
        polygon: nextPolygon,
        symbol: nextSymbol,
        line: nextLine,
        lineClassification: hadLineColorClassificationDependency
          ? undefined
          : visualization.lineClassification,
        lineThicknessClassification: hadLineThicknessClassificationDependency
          ? undefined
          : visualization.lineThicknessClassification,
        text: nextText,
        mapping: nextMapping,
        classification: shouldClearClassification
          ? undefined
          : visualization.classification,
        dataFilters: nextDataFilters
      });
    });

    if (hasChanges) {
      incrementVersion(state);
    }
  }

  function addDataFilter(id: string, filter: Omit<VizDataFilter, 'id'>): void {
    applyVisualizationUpdate(id, (viz) => {
      const existing = viz.dataFilters ?? [];
      const newFilter: VizDataFilter = {
        ...filter,
        id: crypto.randomUUID()
      };
      return { dataFilters: [...existing, newFilter] };
    });
  }

  function removeDataFilter(id: string, filterId: string): void {
    applyVisualizationUpdate(id, (viz) => {
      const existing = viz.dataFilters ?? [];
      return { dataFilters: existing.filter((f) => f.id !== filterId) };
    });
  }

  function updateDataFilter(
    id: string,
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ): void {
    applyVisualizationUpdate(id, (viz) => {
      const existing = viz.dataFilters ?? [];
      return {
        dataFilters: existing.map((f) =>
          f.id === filterId ? { ...f, ...updates } : f
        )
      };
    });
  }

  function clearDataFilters(id: string): void {
    applyVisualizationUpdate(id, () => ({ dataFilters: [] }));
  }

  function clearDataFiltersForPrimitive(
    id: string,
    primitiveType: PrimitiveFilter
  ): void {
    applyVisualizationUpdate(id, (viz) => ({
      dataFilters: (viz.dataFilters ?? []).filter(
        (f) => f.primitiveType !== primitiveType
      )
    }));
  }

  function clear(): void {
    state.visualizations = [];
    state.selectedVisualizationId = undefined;
    updateActiveVisualizationIds((ids) => {
      ids.clear();
      return ids;
    });
    incrementVersion(state);
  }

  function restoreFromSerialized(
    settings: SerializedVisualizationSettings
  ): void {
    const restoredVisualizations = (settings.visualizations || [])
      .filter((viz: VisualizationConfig) => !viz.facet)
      .map((viz: VisualizationConfig) => getNormalizedVisualization(viz));

    state.visualizations = restoredVisualizations;

    const restoredIds = new Set(restoredVisualizations.map((viz) => viz.id));
    state.selectedVisualizationId = restoredIds.has(
      settings.selectedVisualizationId ?? ''
    )
      ? settings.selectedVisualizationId
      : restoredVisualizations[0]?.id;
    state.activeVisualizationIds = new Set(
      (settings.activeVisualizationIds || []).filter((id) =>
        restoredIds.has(id)
      )
    );
    incrementVersion(state);
  }

  return {
    get version(): number {
      return state.version;
    },
    get visualizations(): VisualizationConfig[] {
      return state.visualizations;
    },
    get selectedVisualization(): VisualizationConfig | undefined {
      if (!state.selectedVisualizationId) {
        return undefined;
      }
      return findById(state.visualizations, state.selectedVisualizationId);
    },
    get activeVisualizations(): VisualizationConfig[] {
      return state.visualizations.filter((visualization) =>
        state.activeVisualizationIds.has(visualization.id)
      );
    },
    createVisualization,
    updateModes,
    togglePrimitiveFilter,
    setPrimitiveFilterOrder,
    updateSymbols,
    updateMissingData,
    updateClassification,
    updatePrimitiveClassification,
    updateLineThicknessClassification,
    updatePrimitiveStrokeClassification,
    updateVisualization,
    renameVisualization,
    applyVisualizationPreset,
    duplicateVisualization,
    removeVisualization,
    createBulkVisualizations,
    removeBulkVisualizations,
    setVisualizationOrder,
    toggleVisualization,
    selectVisualization,
    invertPalette,
    getVisualizationsByDataset,
    getVisualizationsUsingColumn,
    renameDatasetColumnReferences,
    removeDatasetColumnReferences,
    addDataFilter,
    removeDataFilter,
    updateDataFilter,
    clearDataFilters,
    clearDataFiltersForPrimitive,
    clear,
    restoreFromSerialized
  };
}

export const visualizationStore = createVisualizationStore();

type ClassificationPropertyKey =
  | 'classification'
  | 'strokeClassification'
  | 'fillClassification'
  | 'thicknessClassification';

type ClassificationContainer = Partial<
  Record<ClassificationPropertyKey, ClassificationConfig | undefined>
>;

const ROOT_CLASSIFICATION_KEYS = [
  'classification',
  'symbolClassification',
  'lineClassification',
  'lineThicknessClassification',
  'textClassification'
] as const;

type RootClassificationPropertyKey = (typeof ROOT_CLASSIFICATION_KEYS)[number];

type RootClassificationContainer = Partial<
  Record<RootClassificationPropertyKey, ClassificationConfig | undefined>
>;

function stripClassificationCounts(
  classification: ClassificationConfig | undefined
): ClassificationConfig | undefined {
  if (!classification?.counts) {
    return classification;
  }

  // Strip query-derived counts while preserving manual/custom fields.
  const { counts: _counts, ...persistentClassification } = classification;
  return persistentClassification;
}

function stripClassificationProperties<T extends object>(
  value: T | undefined,
  keys: readonly ClassificationPropertyKey[]
): T | undefined {
  if (!value) {
    return value;
  }

  const container = value as T & ClassificationContainer;
  let next: (T & ClassificationContainer) | undefined;

  for (const key of keys) {
    const stripped = stripClassificationCounts(container[key]);
    if (stripped !== container[key]) {
      next ??= { ...container };
      next[key] = stripped;
    }
  }

  return next ?? value;
}

function stripRootClassificationProperties(
  visualization: VisualizationConfig
): VisualizationConfig {
  const container = visualization as VisualizationConfig &
    RootClassificationContainer;
  let next: (VisualizationConfig & RootClassificationContainer) | undefined;

  for (const key of ROOT_CLASSIFICATION_KEYS) {
    const stripped = stripClassificationCounts(container[key]);
    if (stripped !== container[key]) {
      next ??= { ...container };
      next[key] = stripped;
    }
  }

  return next ?? visualization;
}

function stripModeStateClassifications<K extends string, T extends object>(
  states: Partial<Record<K, T>> | undefined,
  keys: readonly ClassificationPropertyKey[]
): Partial<Record<K, T>> | undefined {
  if (!states) {
    return states;
  }

  let changed = false;
  const strippedEntries = (
    Object.entries(states) as Array<[K, T | undefined]>
  ).map(([mode, state]) => {
    const strippedState = stripClassificationProperties(state, keys);
    if (strippedState !== state) {
      changed = true;
    }
    return [mode, strippedState] as const;
  });

  return changed
    ? (Object.fromEntries(strippedEntries) as Partial<Record<K, T>>)
    : states;
}

function stripPolygonDerivedSerialization(
  polygon: PolygonPrimitiveConfig | undefined
): PolygonPrimitiveConfig | undefined {
  return stripClassificationProperties(polygon, [
    'classification',
    'strokeClassification'
  ]);
}

function stripSymbolDerivedSerialization(
  symbol: SymbolPrimitiveConfig | undefined
): SymbolPrimitiveConfig | undefined {
  const stripped = stripClassificationProperties(symbol, [
    'classification',
    'fillClassification',
    'strokeClassification'
  ]);

  const modeStates = stripModeStateClassifications(stripped?.modeStates, [
    'classification',
    'fillClassification',
    'strokeClassification'
  ]);

  return modeStates !== stripped?.modeStates && stripped
    ? { ...stripped, modeStates }
    : stripped;
}

function stripLineDerivedSerialization(
  line: LinePrimitiveConfig | undefined
): LinePrimitiveConfig | undefined {
  let stripped = stripClassificationProperties(line, [
    'classification',
    'thicknessClassification'
  ]);

  const colorModeStates = stripModeStateClassifications(
    stripped?.colorModeStates,
    ['classification']
  );
  if (colorModeStates !== stripped?.colorModeStates && stripped) {
    stripped = { ...stripped, colorModeStates };
  }

  const thicknessModeStates = stripModeStateClassifications(
    stripped?.thicknessModeStates,
    ['thicknessClassification']
  );

  return thicknessModeStates !== stripped?.thicknessModeStates && stripped
    ? { ...stripped, thicknessModeStates }
    : stripped;
}

function stripTextBackgroundDerivedSerialization(
  background: TextBackgroundConfig
): TextBackgroundConfig {
  return (
    stripClassificationProperties(background, [
      'classification',
      'strokeClassification'
    ]) ?? background
  );
}

function stripTextDerivedSerialization(
  text: TextPrimitiveConfig | undefined
): TextPrimitiveConfig | undefined {
  let stripped = stripClassificationProperties(text, ['classification']);

  const colorModeStates = stripModeStateClassifications(
    stripped?.colorModeStates,
    ['classification']
  );
  if (colorModeStates !== stripped?.colorModeStates && stripped) {
    stripped = { ...stripped, colorModeStates };
  }

  const sizeModeStates = stripModeStateClassifications(
    stripped?.sizeModeStates,
    ['classification']
  );
  if (sizeModeStates !== stripped?.sizeModeStates && stripped) {
    stripped = { ...stripped, sizeModeStates };
  }

  if (stripped) {
    const background = stripTextBackgroundDerivedSerialization(
      stripped.background
    );
    if (background !== stripped.background) {
      stripped = { ...stripped, background };
    }
  }

  return stripped;
}

function stripVisualizationRestoreSnapshotDerivedSerialization(
  snapshot: VisualizationRestoreSnapshot
): VisualizationRestoreSnapshot {
  let next =
    stripClassificationProperties(snapshot, ['classification']) ?? snapshot;

  const polygon = stripPolygonDerivedSerialization(next.polygon);
  if (polygon !== next.polygon) {
    next = { ...next, polygon };
  }

  const symbol = stripSymbolDerivedSerialization(next.symbol);
  if (symbol !== next.symbol) {
    next = { ...next, symbol };
  }

  const line = stripLineDerivedSerialization(next.line);
  if (line !== next.line) {
    next = { ...next, line };
  }

  const text = stripTextDerivedSerialization(next.text);
  if (text !== next.text) {
    next = { ...next, text };
  }

  return next;
}

function stripVisualizationOriginDerivedSerialization(
  origin: VisualizationOrigin | undefined
): VisualizationOrigin | undefined {
  if (!origin) {
    return origin;
  }

  let next: VisualizationOrigin | undefined;

  if (origin.restoreState) {
    const restoreVisualization =
      stripVisualizationRestoreSnapshotDerivedSerialization(
        origin.restoreState.visualization
      );
    if (restoreVisualization !== origin.restoreState.visualization) {
      next = {
        ...origin,
        restoreState: {
          ...origin.restoreState,
          visualization: restoreVisualization
        }
      };
    }
  }

  if (origin.appliedSuggestionState) {
    const appliedVisualization =
      stripVisualizationRestoreSnapshotDerivedSerialization(
        origin.appliedSuggestionState.visualization
      );
    if (appliedVisualization !== origin.appliedSuggestionState.visualization) {
      next = {
        ...(next ?? origin),
        appliedSuggestionState: {
          ...origin.appliedSuggestionState,
          visualization: appliedVisualization
        }
      };
    }
  }

  return next ?? origin;
}

function stripVisualizationDerivedSerialization(
  visualization: VisualizationConfig
): VisualizationConfig | undefined {
  if (visualization.facet) {
    return undefined;
  }

  let next = stripRootClassificationProperties(visualization);

  const polygon = stripPolygonDerivedSerialization(next.polygon);
  if (polygon !== next.polygon) {
    next = { ...next, polygon };
  }

  const symbol = stripSymbolDerivedSerialization(next.symbol);
  if (symbol !== next.symbol) {
    next = { ...next, symbol };
  }

  const line = stripLineDerivedSerialization(next.line);
  if (line !== next.line) {
    next = { ...next, line };
  }

  const text = stripTextDerivedSerialization(next.text);
  if (text !== next.text) {
    next = { ...next, text };
  }

  const origin = stripVisualizationOriginDerivedSerialization(next.origin);
  if (origin !== next.origin) {
    next = { ...next, origin };
  }

  return next;
}

function serializePersistentVisualizations(): VisualizationConfig[] {
  return visualizationStore.visualizations
    .map(stripVisualizationDerivedSerialization)
    .filter((viz): viz is VisualizationConfig => viz !== undefined);
}

persistenceRegistry.register({
  key: 'visualization',
  serialize: () => {
    const visualizations = serializePersistentVisualizations();
    const persistedIds = new Set(visualizations.map((viz) => viz.id));
    const selectedVisualizationId =
      visualizationStore.selectedVisualization?.id;

    return {
      visualizations,
      selectedVisualizationId:
        selectedVisualizationId && persistedIds.has(selectedVisualizationId)
          ? selectedVisualizationId
          : undefined,
      activeVisualizationIds: visualizationStore.activeVisualizations
        .map((viz) => viz.id)
        .filter((id) => persistedIds.has(id))
    };
  },
  deserialize: (data: unknown) => {
    const settings = data as {
      visualizations?: unknown[];
      selectedVisualizationId?: string;
      activeVisualizationIds?: string[];
    };
    visualizationStore.restoreFromSerialized({
      visualizations: (settings.visualizations ?? []) as Parameters<
        typeof visualizationStore.restoreFromSerialized
      >[0]['visualizations'],
      selectedVisualizationId: settings.selectedVisualizationId,
      activeVisualizationIds: settings.activeVisualizationIds ?? []
    });
  },
  reset: () => visualizationStore.clear(),
  priority: 'debounced'
});
