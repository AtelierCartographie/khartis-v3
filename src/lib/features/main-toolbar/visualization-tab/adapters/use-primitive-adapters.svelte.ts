import {
  type ClassificationConfig,
  type PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  createLineHandlers,
  type LineHandlersDeps
} from './line-handlers.svelte';
import {
  createPolygonHandlers,
  type PolygonHandlersDeps
} from './polygon-handlers.svelte';
import {
  createSymbolHandlers,
  type SymbolHandlersDeps
} from './symbol-handlers.svelte';
import {
  createTextHandlers,
  type TextHandlersDeps
} from './text-handlers.svelte';

export type SharedAdapterDeps = SymbolHandlersDeps &
  PolygonHandlersDeps &
  LineHandlersDeps &
  TextHandlersDeps;

export interface PrimitiveAdaptersDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  updateSelectedVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (next: VisualizationConfig) => void
  ) => void;
  buildNextPrimitiveFilters: SharedAdapterDeps['buildNextPrimitiveFilters'];
  updatePrimitiveClassificationState: SharedAdapterDeps['updatePrimitiveClassificationState'];
  updatePrimitiveStrokeClassificationState: SharedAdapterDeps['updatePrimitiveStrokeClassificationState'];
  updateLineThicknessClassificationState: LineHandlersDeps['updateLineThicknessClassificationState'];
  updateSymbolFillClassificationState: SymbolHandlersDeps['updateSymbolFillClassificationState'];
  updateTextBackgroundClassificationState: TextHandlersDeps['updateTextBackgroundClassificationState'];
  updateTextBackgroundStrokeClassificationState: TextHandlersDeps['updateTextBackgroundStrokeClassificationState'];
  applyPrimitiveMappingUpdate: SharedAdapterDeps['applyPrimitiveMappingUpdate'];
  applyPrimitiveStrokeMappingUpdate: SharedAdapterDeps['applyPrimitiveStrokeMappingUpdate'];
  applySymbolFillMappingUpdate: SymbolHandlersDeps['applySymbolFillMappingUpdate'];
  applyTextBackgroundMappingUpdate: TextHandlersDeps['applyTextBackgroundMappingUpdate'];
  applyTextBackgroundStrokeMappingUpdate: TextHandlersDeps['applyTextBackgroundStrokeMappingUpdate'];
  invertPrimitivePalette: SharedAdapterDeps['invertPrimitivePalette'];
  invertPrimitiveStrokePalette: SharedAdapterDeps['invertPrimitiveStrokePalette'];
  invertSymbolFillPalette: SymbolHandlersDeps['invertSymbolFillPalette'];
  invertTextBackgroundPalette: TextHandlersDeps['invertTextBackgroundPalette'];
  invertTextBackgroundStrokePalette: TextHandlersDeps['invertTextBackgroundStrokePalette'];
  updateTextBackground: TextHandlersDeps['updateTextBackground'];
  ensurePrimitiveClassificationDefaults: SharedAdapterDeps['ensurePrimitiveClassificationDefaults'];
  ensureAutoColumns: SharedAdapterDeps['ensureAutoColumns'];
  ensureSymbolFillClassificationDefaults: SymbolHandlersDeps['ensureSymbolFillClassificationDefaults'];
  ensureSymbolFillAutoColumns: SymbolHandlersDeps['ensureSymbolFillAutoColumns'];
  ensurePrimitiveStrokeClassificationDefaults: SharedAdapterDeps['ensurePrimitiveStrokeClassificationDefaults'];
  ensurePrimitiveStrokeAutoColumns: SharedAdapterDeps['ensurePrimitiveStrokeAutoColumns'];
  ensureTextBackgroundClassificationDefaults: TextHandlersDeps['ensureTextBackgroundClassificationDefaults'];
  ensureTextBackgroundAutoColumns: TextHandlersDeps['ensureTextBackgroundAutoColumns'];
  ensureTextBackgroundStrokeClassificationDefaults: TextHandlersDeps['ensureTextBackgroundStrokeClassificationDefaults'];
  ensureTextBackgroundStrokeAutoColumns: TextHandlersDeps['ensureTextBackgroundStrokeAutoColumns'];
  applyStrokePolygonClassificationUpdate: (
    updates: Partial<ClassificationConfig>
  ) => void;
}

export function usePrimitiveAdapters(deps: PrimitiveAdaptersDeps) {
  const polygon = createPolygonHandlers({
    getSelectedVisualization: deps.getSelectedVisualization,
    updateSelectedVisualization: deps.updateSelectedVisualization,
    buildNextPrimitiveFilters: deps.buildNextPrimitiveFilters,
    updatePrimitiveClassificationState: deps.updatePrimitiveClassificationState,
    applyPrimitiveMappingUpdate: deps.applyPrimitiveMappingUpdate,
    applyPrimitiveStrokeMappingUpdate: deps.applyPrimitiveStrokeMappingUpdate,
    invertPrimitivePalette: deps.invertPrimitivePalette,
    invertPrimitiveStrokePalette: deps.invertPrimitiveStrokePalette,
    ensurePrimitiveClassificationDefaults:
      deps.ensurePrimitiveClassificationDefaults,
    ensureAutoColumns: deps.ensureAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults:
      deps.ensurePrimitiveStrokeClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns: deps.ensurePrimitiveStrokeAutoColumns
  });

  const symbol = createSymbolHandlers({
    getSelectedVisualization: deps.getSelectedVisualization,
    updateSelectedVisualization: deps.updateSelectedVisualization,
    buildNextPrimitiveFilters: deps.buildNextPrimitiveFilters,
    updatePrimitiveClassificationState: deps.updatePrimitiveClassificationState,
    updatePrimitiveStrokeClassificationState:
      deps.updatePrimitiveStrokeClassificationState,
    updateSymbolFillClassificationState:
      deps.updateSymbolFillClassificationState,
    applyPrimitiveMappingUpdate: deps.applyPrimitiveMappingUpdate,
    applyPrimitiveStrokeMappingUpdate: deps.applyPrimitiveStrokeMappingUpdate,
    applySymbolFillMappingUpdate: deps.applySymbolFillMappingUpdate,
    invertPrimitivePalette: deps.invertPrimitivePalette,
    invertPrimitiveStrokePalette: deps.invertPrimitiveStrokePalette,
    invertSymbolFillPalette: deps.invertSymbolFillPalette,
    ensurePrimitiveClassificationDefaults:
      deps.ensurePrimitiveClassificationDefaults,
    ensureAutoColumns: deps.ensureAutoColumns,
    ensureSymbolFillClassificationDefaults:
      deps.ensureSymbolFillClassificationDefaults,
    ensureSymbolFillAutoColumns: deps.ensureSymbolFillAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults:
      deps.ensurePrimitiveStrokeClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns: deps.ensurePrimitiveStrokeAutoColumns
  });

  const line = createLineHandlers({
    getSelectedVisualization: deps.getSelectedVisualization,
    updateSelectedVisualization: deps.updateSelectedVisualization,
    buildNextPrimitiveFilters: deps.buildNextPrimitiveFilters,
    updatePrimitiveClassificationState: deps.updatePrimitiveClassificationState,
    updateLineThicknessClassificationState:
      deps.updateLineThicknessClassificationState,
    applyPrimitiveMappingUpdate: deps.applyPrimitiveMappingUpdate,
    invertPrimitivePalette: deps.invertPrimitivePalette,
    ensurePrimitiveClassificationDefaults:
      deps.ensurePrimitiveClassificationDefaults,
    ensureAutoColumns: deps.ensureAutoColumns
  });

  const text = createTextHandlers({
    getSelectedVisualization: deps.getSelectedVisualization,
    updateSelectedVisualization: deps.updateSelectedVisualization,
    updatePrimitiveClassificationState: deps.updatePrimitiveClassificationState,
    updateTextBackgroundClassificationState:
      deps.updateTextBackgroundClassificationState,
    updateTextBackgroundStrokeClassificationState:
      deps.updateTextBackgroundStrokeClassificationState,
    applyPrimitiveMappingUpdate: deps.applyPrimitiveMappingUpdate,
    applyTextBackgroundMappingUpdate: deps.applyTextBackgroundMappingUpdate,
    applyTextBackgroundStrokeMappingUpdate:
      deps.applyTextBackgroundStrokeMappingUpdate,
    invertPrimitivePalette: deps.invertPrimitivePalette,
    invertTextBackgroundPalette: deps.invertTextBackgroundPalette,
    invertTextBackgroundStrokePalette: deps.invertTextBackgroundStrokePalette,
    updateTextBackground: deps.updateTextBackground,
    ensurePrimitiveClassificationDefaults:
      deps.ensurePrimitiveClassificationDefaults,
    ensureAutoColumns: deps.ensureAutoColumns,
    ensureTextBackgroundClassificationDefaults:
      deps.ensureTextBackgroundClassificationDefaults,
    ensureTextBackgroundAutoColumns: deps.ensureTextBackgroundAutoColumns,
    ensureTextBackgroundStrokeClassificationDefaults:
      deps.ensureTextBackgroundStrokeClassificationDefaults,
    ensureTextBackgroundStrokeAutoColumns:
      deps.ensureTextBackgroundStrokeAutoColumns
  });

  function handlePolygonStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.applyStrokePolygonClassificationUpdate(updates);
  }

  return {
    ...polygon,
    ...symbol,
    ...line,
    ...text,
    handlePolygonStrokeClassificationChange
  } satisfies Record<string, unknown>;
}

export type PrimitiveAdapters = ReturnType<typeof usePrimitiveAdapters>;
export type _ReexportedPrimitiveFilterType = PrimitiveFilterType;
