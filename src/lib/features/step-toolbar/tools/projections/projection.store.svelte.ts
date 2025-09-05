import { toolActions, toolState } from '../tools-store/tools.store.svelte';
import type { ProjectionState } from './projections.types';

export function getProjectionState(): ProjectionState {
  return toolState.projection;
}

export const projectionActions = {
  setState(newState: Partial<ProjectionState>): void {
    toolActions.updateProjection(newState);
  },

  setSelected(projectionId: string): void {
    toolActions.updateProjection({ selected: projectionId });
  },

  setViewMode(mode: 'list' | 'grid'): void {
    toolActions.updateProjection({ viewMode: mode });
  },

  setCenter(longitude: number, latitude: number): void {
    toolActions.updateProjection({
      center: [longitude, latitude],
      longitude,
      latitude
    });
  },

  setRotation(rotation: number): void {
    toolActions.updateProjection({ rotation });
  },

  setScale(scale: number): void {
    toolActions.updateProjection({ scale: Math.max(0.1, Math.min(10, scale)) });
  },

  reset(): void {
    toolActions.updateProjection({
      selected: 'natural-earth',
      viewMode: 'list',
      longitude: 0,
      latitude: 0,
      rotation: 0,
      center: [0, 0],
      scale: 1
    });
  }
};
