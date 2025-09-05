export interface ProjectionState {
  selected: string;
  viewMode: 'list' | 'grid';
  longitude: number;
  latitude: number;
  rotation: number;
  scale?: number;
  center?: [number, number];
}
