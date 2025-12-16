import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  fitProjectionToGeoJSON,
  getProjectionById,
  projectGeoJSON,
  suggestProjection,
  type ProjectionInfo
} from '$lib/features/commons/utils/projection.utils';
import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { ProjectionState } from './projections.types';

const DEFAULT_PROJECTION_STATE: ProjectionState = {
  selected: 'mercator',
  viewMode: ViewMode.LIST,
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

  setViewMode(mode: ViewMode): void {
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

  reset: createResetFunction(projectionState, DEFAULT_PROJECTION_STATE),

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
  ): FeatureCollection | null {
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset || !dataset.data) return null;

    const features: Feature<Geometry, Record<string, unknown>>[] = dataset.data
      .map((d) => {
        if (!isGeometryCandidate(d.geometry)) {
          return null;
        }
        return {
          type: 'Feature' as const,
          geometry: d.geometry,
          properties: d as Record<string, unknown>
        };
      })
      .filter(
        (feature): feature is Feature<Geometry, Record<string, unknown>> =>
          feature !== null
      );

    if (features.length === 0) {
      return null;
    }

    const geojson: FeatureCollection<Geometry, Record<string, unknown>> = {
      type: 'FeatureCollection',
      features
    };

    if (projectionState.autoFit) {
      const projection = fitProjectionToGeoJSON(
        geojson,
        projectionState.selected,
        width,
        height
      );

      const projected = projectGeoJSON(geojson, projectionState.selected, {
        scale: projection.scale(),
        translate: projection.translate(),
        rotate: [projectionState.rotation, 0, 0],
        center: projectionState.center
      });

      return projected.type === 'FeatureCollection' ? projected : null;
    }

    const projected = projectGeoJSON(geojson, projectionState.selected, {
      scale: (projectionState.scale || 1) * 100,
      translate: [width / 2, height / 2],
      rotate: [projectionState.rotation, 0, 0],
      center: projectionState.center || [
        projectionState.longitude,
        projectionState.latitude
      ]
    });

    return projected.type === 'FeatureCollection' ? projected : null;
  },

  getCurrentProjectionInfo(): ProjectionInfo | undefined {
    return getProjectionById(projectionState.selected);
  }
};

function isGeometryCandidate(value: unknown): value is Geometry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as { type?: unknown };
  return typeof record.type === 'string' && 'coordinates' in value;
}
