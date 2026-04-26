import type {
  ClassificationConfig,
  MissingDataConfig,
  SymbolPrimitiveConfig,
  VisualizationConfig,
  VisualizationModes
} from '$lib/features/commons/store/visualization.store.svelte';

export interface SymbolModeProps {
  dataFields: Array<{ id: number; text: string; type?: string }>;
  visualization?: VisualizationConfig;
  fillVisualization?: VisualizationConfig;
  onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
  onModesChange?: (updates: Partial<VisualizationModes>) => void;
  onSymbolsChange?: (updates: Partial<VisualizationConfig['symbols']>) => void;
  onSymbolPrimitiveChange?: (updates: Partial<SymbolPrimitiveConfig>) => void;
  onMappingChange?: (updates: Partial<VisualizationConfig['mapping']>) => void;
  onFillMappingChange?: (
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  onStrokeMappingChange?: (
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
  onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  onFillClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  onStrokeClassificationChange?: (
    updates: Partial<ClassificationConfig>
  ) => void;
  onInvertPalette?: () => void;
  onFillInvertPalette?: () => void;
  onStrokeInvertPalette?: () => void;
  onOpenSizeDiscretization?: () => void;
  onOpenFillDiscretization?: () => void;
}
