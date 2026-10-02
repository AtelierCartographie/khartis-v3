import type {
  ClassificationConfig,
  PrimitiveFilter,
  PrimitiveFilterType,
  VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';

export interface PrimitiveHandlersDeps {
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

export interface PrimitiveStrokeHandlersDeps {
  applyPrimitiveStrokeMappingUpdate: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  invertPrimitiveStrokePalette: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON
  ) => void;
  ensurePrimitiveStrokeClassificationDefaults: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    visualization: VisualizationConfig
  ) => void;
  ensurePrimitiveStrokeAutoColumns: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    visualization: VisualizationConfig
  ) => void;
}
