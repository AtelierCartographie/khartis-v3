import {
  PrimitiveFilterType,
  type ClassificationConfig,
  type MissingDataConfig,
  type SymbolPrimitiveConfig,
  type VisualizationConfig,
  type VisualizationModes,
  getSymbolPrimitive
} from '$lib/features/commons/store/visualization.store.svelte';
import { SymbolMode } from '$lib/features/main-toolbar/constants';
import { resolveSymbolModeTransition } from '../use-symbol-mode-state.svelte';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';

export interface SymbolHandlersDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  updateSelectedVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (next: VisualizationConfig) => void
  ) => void;
  buildNextPrimitiveFilters: (
    updates: Partial<Record<PrimitiveFilterType, boolean>>
  ) => PrimitiveFilterType[];
  updatePrimitiveClassificationState: (
    primitive: PrimitiveFilterType,
    updates: Partial<ClassificationConfig>
  ) => void;
  updatePrimitiveStrokeClassificationState: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    updates: Partial<ClassificationConfig>
  ) => void;
  updateSymbolFillClassificationState: (
    updates: Partial<ClassificationConfig>
  ) => void;
  applyPrimitiveMappingUpdate: (
    primitive: PrimitiveFilterType,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  applyPrimitiveStrokeMappingUpdate: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  applySymbolFillMappingUpdate: (
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  invertPrimitivePalette: (primitive: PrimitiveFilterType) => void;
  invertPrimitiveStrokePalette: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON
  ) => void;
  invertSymbolFillPalette: () => void;
  ensurePrimitiveClassificationDefaults: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensureAutoColumns: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensureSymbolFillClassificationDefaults: (
    visualization: VisualizationConfig
  ) => void;
  ensureSymbolFillAutoColumns: (visualization: VisualizationConfig) => void;
  ensurePrimitiveStrokeClassificationDefaults: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    visualization: VisualizationConfig
  ) => void;
  ensurePrimitiveStrokeAutoColumns: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    visualization: VisualizationConfig
  ) => void;
}

export function createSymbolHandlers(deps: SymbolHandlersDeps) {
  function handleSymbolChange(updates: Partial<SymbolPrimitiveConfig>): void {
    const symbol = getSymbolPrimitive(deps.getSelectedVisualization());
    if (!symbol) return;

    const enabledHasUpdate = Object.prototype.hasOwnProperty.call(
      updates,
      'enabled'
    );

    deps.updateSelectedVisualization({
      symbol: { ...symbol, ...updates },
      ...(enabledHasUpdate
        ? {
            primitiveFilters: deps.buildNextPrimitiveFilters({
              [PrimitiveFilterType.POINT]: updates.enabled ?? symbol.enabled
            })
          }
        : {})
    });
  }

  function handleSymbolStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ): void {
    const symbol = getSymbolPrimitive(deps.getSelectedVisualization());
    if (!symbol) return;

    const renamed = pickRenamedKeys<
      VisualizationConfig['style'],
      SymbolPrimitiveConfig
    >(updates, [{ from: 'symbolFillColor', to: 'fillColor' }]);
    const passthrough = pickOwnedKeys(updates, [
      'fillColorB',
      'strokeColor'
    ] as const);
    const withFallback = pickOwnedKeys(
      updates,
      ['strokeWidth', 'strokeOpacity', 'strokeDashed'] as const,
      symbol
    );

    handleSymbolChange({ ...renamed, ...passthrough, ...withFallback });
  }

  function handleSymbolModesChange(updates: Partial<VisualizationModes>): void {
    const symbol = getSymbolPrimitive(deps.getSelectedVisualization());
    if (!symbol) return;

    const modeChanging =
      Object.prototype.hasOwnProperty.call(updates, 'symbol') &&
      updates.symbol !== undefined &&
      updates.symbol !== symbol.mode;

    const nextMode = modeChanging
      ? (updates.symbol as SymbolMode)
      : symbol.mode;
    const modeTransition = modeChanging
      ? resolveSymbolModeTransition(symbol, nextMode)
      : null;

    const renamed = pickRenamedKeys<VisualizationModes, SymbolPrimitiveConfig>(
      updates,
      [
        { from: 'fill', to: 'fillMode' },
        { from: 'stroke', to: 'strokeMode' }
      ],
      symbol
    );
    const symbolFields = pickOwnedKeys(
      updates as Partial<SymbolPrimitiveConfig>,
      ['proportionalType', 'categoryShape'] as const,
      symbol
    );

    deps.updateSelectedVisualization(
      {
        symbol: {
          ...symbol,
          ...(modeChanging ? { mode: nextMode } : {}),
          ...(modeTransition?.restoredStateFields ?? {}),
          modeStates: modeTransition?.nextModeStates ?? symbol.modeStates ?? {},
          ...renamed,
          ...symbolFields
        }
      },
      (next) => {
        deps.ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.POINT,
          next
        );
        deps.ensureAutoColumns(PrimitiveFilterType.POINT, next);
        deps.ensureSymbolFillClassificationDefaults(next);
        deps.ensureSymbolFillAutoColumns(next);
        deps.ensurePrimitiveStrokeClassificationDefaults(
          PrimitiveFilterType.POINT,
          next
        );
        deps.ensurePrimitiveStrokeAutoColumns(PrimitiveFilterType.POINT, next);
      }
    );
  }

  function handleSymbolsChange(
    updates: Partial<VisualizationConfig['symbols']> | undefined
  ): void {
    const symbol = getSymbolPrimitive(deps.getSelectedVisualization());
    if (!symbol || !updates) return;

    const renamed = pickRenamedKeys<
      NonNullable<VisualizationConfig['symbols']>,
      SymbolPrimitiveConfig
    >(updates, [{ from: 'type', to: 'shape' }], symbol);
    const withFallback = pickOwnedKeys(
      updates as Partial<SymbolPrimitiveConfig>,
      ['size', 'minSize', 'maxSize', 'sizeScale', 'opacity'] as const,
      symbol
    );

    handleSymbolChange({ ...renamed, ...withFallback });
  }

  function handleSymbolMissingDataChange(
    updates: Partial<MissingDataConfig>
  ): void {
    const symbol = getSymbolPrimitive(deps.getSelectedVisualization());
    if (!symbol?.missingData) return;

    handleSymbolChange({
      missingData: { ...symbol.missingData, ...updates }
    });
  }

  function handleSymbolClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updatePrimitiveClassificationState(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolFillClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updateSymbolFillClassificationState(updates);
  }

  function handleSymbolStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updatePrimitiveStrokeClassificationState(
      PrimitiveFilterType.POINT,
      updates
    );
  }

  function handleSymbolMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyPrimitiveMappingUpdate(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolFillMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applySymbolFillMappingUpdate(updates);
  }

  function handleSymbolStrokeMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyPrimitiveStrokeMappingUpdate(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolPaletteInvert(): void {
    deps.invertPrimitivePalette(PrimitiveFilterType.POINT);
  }

  function handleSymbolFillPaletteInvert(): void {
    deps.invertSymbolFillPalette();
  }

  function handleSymbolStrokePaletteInvert(): void {
    deps.invertPrimitiveStrokePalette(PrimitiveFilterType.POINT);
  }

  return {
    handleSymbolChange,
    handleSymbolStyleChange,
    handleSymbolModesChange,
    handleSymbolsChange,
    handleSymbolMissingDataChange,
    handleSymbolClassificationChange,
    handleSymbolFillClassificationChange,
    handleSymbolStrokeClassificationChange,
    handleSymbolMappingChange,
    handleSymbolFillMappingChange,
    handleSymbolStrokeMappingChange,
    handleSymbolPaletteInvert,
    handleSymbolFillPaletteInvert,
    handleSymbolStrokePaletteInvert
  };
}
