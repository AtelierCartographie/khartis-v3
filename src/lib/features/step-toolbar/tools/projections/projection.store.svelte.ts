import type { ProjectionState } from './projections.types';
import {
  getProjectionById,
  suggestProjection,
  fitProjectionToGeoJSON,
  projectGeoJSON,
  getBoundsFromGeoJSON,
  type ProjectionInfo
} from '$lib/features/commons/utils/projection.utils';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

const DEFAULT_PROJECTION_STATE: ProjectionState = {
  selected: 'mercator',
  viewMode: 'list',
  longitude: 0,
  latitude: 0,
  rotation: 0,
  scale: 1,
  autoFit: true
};

export const projectionState = $state<ProjectionState>({
  ...DEFAULT_PROJECTION_STATE
});

export function getProjectionState(): ProjectionState {
  return projectionState;
}

export const projectionActions = {
  setState(newState: Partial<ProjectionState>): void {
    Object.assign(projectionState, newState);
  },

  setSelected(projectionId: string): void {
    projectionState.selected = projectionId;
  },

  setViewMode(mode: 'list' | 'grid'): void {
    projectionState.viewMode = mode;
  },

  setCenter(longitude: number, latitude: number): void {
    projectionState.center = [longitude, latitude];
    projectionState.longitude = longitude;
    projectionState.latitude = latitude;
  },

  setRotation(rotation: number): void {
    projectionState.rotation = rotation;
  },

  setScale(scale: number): void {
    projectionState.scale = Math.max(0.1, Math.min(10, scale));
  },

  reset(): void {
    Object.assign(projectionState, DEFAULT_PROJECTION_STATE);
  },

  suggestProjectionForCurrentData(): void {
    const geoDatasets = datasetsStore.getDatasetsByType(true);
    if (geoDatasets.length === 0) return;

    const firstDataset = geoDatasets[0];
    if (!firstDataset.geometry?.bounds) return;

    const bounds: [[number, number], [number, number]] = [
      [firstDataset.geometry.bounds[0], firstDataset.geometry.bounds[1]],
      [firstDataset.geometry.bounds[2], firstDataset.geometry.bounds[3]]
    ];

    const suggested = suggestProjection(bounds);
    this.setSelected(suggested);
  },

  applyProjectionToDataset(
    datasetId: string,
    width: number,
    height: number
  ): any {
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset || !dataset.data) return null;

    const geojson = {
      type: 'FeatureCollection',
      features: dataset.data
        .filter((d) => d.geometry)
        .map((d) => ({
          type: 'Feature',
          geometry: d.geometry,
          properties: d
        }))
    };

    if (projectionState.autoFit) {
      const projection = fitProjectionToGeoJSON(
        geojson,
        projectionState.selected,
        width,
        height
      );

      return projectGeoJSON(geojson, projectionState.selected, {
        scale: projection.scale(),
        translate: projection.translate(),
        rotate: [projectionState.rotation, 0, 0],
        center: projectionState.center
      });
    }

    return projectGeoJSON(geojson, projectionState.selected, {
      scale: (projectionState.scale || 1) * 100,
      translate: [width / 2, height / 2],
      rotate: [projectionState.rotation, 0, 0],
      center: projectionState.center || [
        projectionState.longitude,
        projectionState.latitude
      ]
    });
  },

  getCurrentProjectionInfo(): ProjectionInfo | undefined {
    return getProjectionById(projectionState.selected);
  }
};
