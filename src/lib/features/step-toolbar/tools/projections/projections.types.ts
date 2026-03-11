import { ViewMode } from '$lib/features/commons/constants/ui.constants';

export interface ProjectionState {
  selected: string;
  viewMode: ViewMode;
  longitude: number;
  latitude: number;
  rotation: number;
  scale?: number;
  center?: [number, number];
  autoFit?: boolean;
  customCode?: string;
  simplifiedPreview?: boolean;
}
