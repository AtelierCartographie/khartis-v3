import {
  PrimitiveFilterType,
  type ClassificationConfig,
  type LinePrimitiveConfig,
  type MissingDataConfig,
  type VisualizationConfig,
  type VisualizationModes,
  getLinePrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import { resolveLineModeTransition } from '../hooks/use-line-mode-state.svelte';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';

export interface LineHandlersDeps {
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
  updateLineThicknessClassificationState: (
    updates: Partial<ClassificationConfig>
  ) => void;
  applyPrimitiveMappingUpdate: (
    primitive: PrimitiveFilterType,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  invertPrimitivePalette: (primitive: PrimitiveFilterType) => void;
  ensurePrimitiveClassificationDefaults: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensureAutoColumns: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
}

export function createLineHandlers(deps: LineHandlersDeps) {
  function handleLineChange(updates: Partial<LinePrimitiveConfig>): void {
    const line = getLinePrimitive(deps.getSelectedVisualization());
    if (!line) return;

    const enabledHasUpdate = Object.prototype.hasOwnProperty.call(
      updates,
      'enabled'
    );

    deps.updateSelectedVisualization({
      line: { ...line, ...updates },
      ...(enabledHasUpdate
        ? {
            primitiveFilters: deps.buildNextPrimitiveFilters({
              [PrimitiveFilterType.LINE]: updates.enabled ?? line.enabled
            })
          }
        : {})
    });
  }

  function handleLineStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ): void {
    const line = getLinePrimitive(deps.getSelectedVisualization());
    if (!line) return;

    const renamedNoFallback = pickRenamedKeys<
      VisualizationConfig['style'],
      LinePrimitiveConfig
    >(updates, [{ from: 'lineColor', to: 'color' }]);
    const renamedWithFallback = pickRenamedKeys<
      VisualizationConfig['style'],
      LinePrimitiveConfig
    >(
      updates,
      [
        { from: 'lineOpacity', to: 'opacity' },
        { from: 'lineWidth', to: 'width' },
        { from: 'lineMaxWidth', to: 'maxWidth' },
        { from: 'lineDashed', to: 'dashed' }
      ],
      line
    );
    handleLineChange({ ...renamedNoFallback, ...renamedWithFallback });
  }

  function handleLineModesChange(updates: Partial<VisualizationModes>): void {
    const viz = deps.getSelectedVisualization();
    const line = getLinePrimitive(viz);
    if (!line || !viz) return;

    const modeTransitionInput = pickOwnedKeys(updates, [
      'color',
      'thickness'
    ] as const);
    const modeTransition = resolveLineModeTransition(line, modeTransitionInput);

    const classificationUpdates = pickOwnedKeys(
      modeTransition.nextVisualizationUpdates,
      ['lineClassification', 'lineThicknessClassification'] as const
    );
    const hasMappingUpdates =
      Object.keys(modeTransition.nextMappingUpdates).length > 0;

    deps.updateSelectedVisualization(
      {
        ...classificationUpdates,
        line: { ...line, ...modeTransition.nextLineUpdates },
        ...(hasMappingUpdates
          ? {
              mapping: {
                ...viz.mapping,
                ...modeTransition.nextMappingUpdates
              }
            }
          : {})
      },
      (next) => {
        deps.ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.LINE,
          next
        );
        deps.ensureAutoColumns(PrimitiveFilterType.LINE, next);
      }
    );
  }

  function handleLineMissingDataChange(
    updates: Partial<MissingDataConfig>
  ): void {
    const line = getLinePrimitive(deps.getSelectedVisualization());
    if (!line?.missingData) return;

    handleLineChange({
      missingData: { ...line.missingData, ...updates }
    });
  }

  function handleLineClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updatePrimitiveClassificationState(PrimitiveFilterType.LINE, updates);
  }

  function handleLineThicknessClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updateLineThicknessClassificationState(updates);
  }

  function handleLineMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyPrimitiveMappingUpdate(PrimitiveFilterType.LINE, updates);
  }

  function handleLinePaletteInvert(): void {
    deps.invertPrimitivePalette(PrimitiveFilterType.LINE);
  }

  return {
    handleLineChange,
    handleLineStyleChange,
    handleLineModesChange,
    handleLineMissingDataChange,
    handleLineClassificationChange,
    handleLineThicknessClassificationChange,
    handleLineMappingChange,
    handleLinePaletteInvert
  };
}
