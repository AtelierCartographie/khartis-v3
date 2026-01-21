import type {
  ClassificationConfig,
  MissingDataConfig,
  VisualizationConfig,
  VisualizationModes
} from '$lib/features/commons/store/visualization.store.svelte';
import type { ShapeType } from '../../../constants';

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

export interface SymbolStyleState {
  symbolSize: number;
  symbolMaxSize: number;
  symbolOpacity: number;
  shapeType: ShapeType;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
}
