import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { ProjectionSuggestion } from '../tools/projections/projection-suggest.service';
import type { D3Usage } from '@ateliercartographie/proj-suggest';

export interface ProjectionState {
  selected: string;
  overrideActive?: boolean;
  overrideSource?: 'auto' | 'manual';
  viewMode: ViewMode;
  longitude: number;
  latitude: number;
  rotation: number;
  center?: [number, number];
  customCode?: string;
  activeSuggestionId?: string;
  suggestionD3Config?: D3Usage;
  suggestionScale?: string[];
  suggestions?: {
    national: ProjectionSuggestion[];
    generic: ProjectionSuggestion[];
  };
}
