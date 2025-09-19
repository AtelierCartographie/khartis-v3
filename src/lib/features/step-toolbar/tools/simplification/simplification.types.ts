import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';

export interface SimplificationResult {
  type: 'basemap' | 'geodata';
  simplified: boolean;
  vertexReduction: number;
  originalVertices: number;
  simplifiedVertices: number;
  level?: SimplificationLevel;
  rate?: number;
}

export interface SimplificationState {
  source: SimplificationSource;
  level: SimplificationLevel;
  rate: number;
  isProcessing: boolean;
  lastApplied?: {
    source: SimplificationSource;
    level?: SimplificationLevel;
    rate?: number;
    timestamp: number;
  };
}
