import type {
  ClassificationConfig,
  MissingDataConfig,
  VisualizationConfig,
  VisualizationModes
} from '$lib/features/commons/store/visualization.store.svelte';
export interface SymbolModeProps {
  dataFields: Array<{ id: number; text: string }>;
  visualization?: VisualizationConfig;
  onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
  onModesChange?: (updates: Partial<VisualizationModes>) => void;
  onSymbolsChange?: (updates: Partial<VisualizationConfig['symbols']>) => void;
  onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
  onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  onInvertPalette?: () => void;
  onOpenDiscretization?: () => void;
}
