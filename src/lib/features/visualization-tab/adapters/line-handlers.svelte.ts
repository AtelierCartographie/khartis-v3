import {
  PrimitiveFilterType,
  type ClassificationConfig,
  type LinePrimitiveConfig,
  type PrimitiveFilter,
  type VisualizationConfig,
  type VisualizationModes,
  getLinePrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import { resolveLineModeTransition } from '../hooks/use-line-mode-state.svelte';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';
import { createPrimitiveAdapter } from './primitive-adapter.factory';

export interface LineHandlersDeps {
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
  const lineAdapter = createPrimitiveAdapter<LinePrimitiveConfig>(deps, {
    primitive: PrimitiveFilterType.LINE,
    getConfig: getLinePrimitive,
    buildUpdate: (line) => ({ line })
  });
  const handleLineChange = lineAdapter.handleChange;

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
        { from: 'lineDashed', to: 'dashed' },
        { from: 'lineDashedPattern', to: 'dashedPattern' }
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

  const handleLineMissingDataChange = lineAdapter.handleMissingDataChange;

  const handleLineClassificationChange = lineAdapter.handleClassificationChange;

  function handleLineThicknessClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updateLineThicknessClassificationState(updates);
  }

  const handleLineMappingChange = lineAdapter.handleMappingChange;

  const handleLinePaletteInvert = lineAdapter.handlePaletteInvert;

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
