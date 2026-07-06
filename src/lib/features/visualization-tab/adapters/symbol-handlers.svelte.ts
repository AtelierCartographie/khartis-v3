import {
  PrimitiveFilterType,
  type ClassificationConfig,
  type PrimitiveFilter,
  type SymbolPrimitiveConfig,
  type VisualizationConfig,
  type VisualizationModes,
  getSymbolPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import { SymbolMode } from '$lib/features/commons/constants/visualization.constants';
import { resolveSymbolModeTransition } from '../hooks/use-symbol-mode-state.svelte';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';
import { createPrimitiveAdapter } from './primitive-adapter.factory';

type ClassificationUpdateOptions = { preserveOrigin?: boolean };

export interface SymbolHandlersDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  updateSelectedVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (next: VisualizationConfig) => void
  ) => void;
  buildNextPrimitiveFilters: (
    updates: Partial<Record<PrimitiveFilter, boolean>>
  ) => PrimitiveFilter[];
  updatePrimitiveClassificationState: (
    primitive: PrimitiveFilterType,
    updates: Partial<ClassificationConfig>
  ) => void;
  updatePrimitiveStrokeClassificationState: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ) => void;
  updateSymbolFillClassificationState: (
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
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
  const symbolAdapter = createPrimitiveAdapter<SymbolPrimitiveConfig>(deps, {
    primitive: PrimitiveFilterType.POINT,
    getConfig: getSymbolPrimitive,
    buildUpdate: (symbol) => ({ symbol })
  });
  const handleSymbolChange = symbolAdapter.handleChange;

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
      [
        'strokeWidth',
        'strokeOpacity',
        'strokeDashed',
        'strokeDashedPattern'
      ] as const,
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
      [
        'size',
        'minSize',
        'maxSize',
        'barWidth',
        'sizeScale',
        'opacity'
      ] as const,
      symbol
    );

    handleSymbolChange({ ...renamed, ...withFallback });
  }

  const handleSymbolMissingDataChange = symbolAdapter.handleMissingDataChange;

  const handleSymbolClassificationChange =
    symbolAdapter.handleClassificationChange;

  function handleSymbolFillClassificationChange(
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ): void {
    if (options) {
      deps.updateSymbolFillClassificationState(updates, options);
    } else {
      deps.updateSymbolFillClassificationState(updates);
    }
  }

  function handleSymbolStrokeClassificationChange(
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ): void {
    if (options) {
      deps.updatePrimitiveStrokeClassificationState(
        PrimitiveFilterType.POINT,
        updates,
        options
      );
    } else {
      deps.updatePrimitiveStrokeClassificationState(
        PrimitiveFilterType.POINT,
        updates
      );
    }
  }

  const handleSymbolMappingChange = symbolAdapter.handleMappingChange;

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

  const handleSymbolPaletteInvert = symbolAdapter.handlePaletteInvert;

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
