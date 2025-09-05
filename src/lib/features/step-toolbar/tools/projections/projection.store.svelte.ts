import type { ProjectionState } from './projections.types';

const DEFAULT_STATE: ProjectionState = {
  selected: 'natural-earth',
  viewMode: 'list',
  longitude: 0,
  latitude: 0,
  rotation: 0,
  center: [0, 0],
  scale: 1
};

export const projectionState = $state<ProjectionState>({ ...DEFAULT_STATE });

export const projectionActions = {
  setState(newState: Partial<ProjectionState>): void {
    Object.assign(projectionState, newState);
    console.log('[Projection] 🔄 State updated:', newState);
  },

  setSelected(projectionId: string): void {
    projectionState.selected = projectionId;
    console.log('[Projection] 🗺️ Selected projection:', projectionId);
  },

  setViewMode(mode: 'list' | 'grid'): void {
    projectionState.viewMode = mode;
    console.log('[Projection] 👁️ View mode:', mode);
  },

  setCenter(longitude: number, latitude: number): void {
    projectionState.center = [longitude, latitude];
    projectionState.longitude = longitude;
    projectionState.latitude = latitude;
    console.log('[Projection] 🎯 Center set to:', longitude, latitude);
  },

  setRotation(rotation: number): void {
    projectionState.rotation = rotation;
    console.log('[Projection] 🔄 Rotation set to:', rotation + '°');
  },

  setScale(scale: number): void {
    projectionState.scale = Math.max(0.1, Math.min(10, scale));
    console.log('[Projection] 🔍 Scale set to:', projectionState.scale);
  },

  reset(): void {
    console.log('[Projection] 🔄 Reset to default state');
    Object.assign(projectionState, DEFAULT_STATE);
  }
};
