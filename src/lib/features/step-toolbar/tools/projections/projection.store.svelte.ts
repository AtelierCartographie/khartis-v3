import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  fitProjectionToGeoJSON,
  getProjectionById,
  projectGeoJSON,
  suggestProjection,
  type ProjectionInfo
} from '$lib/features/commons/utils/projection.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { ProjectionState } from './projections.types';

const DEFAULT_STATE: ProjectionState = {
  selected: 'mercator',
  viewMode: ViewMode.LIST,
  longitude: 0,
  latitude: 0,
  rotation: 0,
  scale: 1,
  autoFit: true
};

function isGeometryCandidate(value: unknown): value is Geometry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as { type?: unknown };
  return typeof record.type === 'string' && 'coordinates' in value;
}

type ProjectionActions = {
  setSelected: (projectionId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setCenter: (longitude: number, latitude: number) => void;
  setRotation: (rotation: number) => void;
  setScale: (scale: number) => void;
  suggestProjectionForCurrentData: () => void;
  applyProjectionToDataset: (
    datasetId: string,
    width: number,
    height: number
  ) => FeatureCollection | null;
  getCurrentProjectionInfo: () => ProjectionInfo | undefined;
};

const { actions } = createToolStore<ProjectionState, ProjectionActions>(
  DEFAULT_STATE,
  (s) => {
    const setSelected = (projectionId: string) => {
      s.selected = projectionId;
    };

    return {
      setSelected,
      setViewMode: (mode: ViewMode) => {
        s.viewMode = mode;
      },
      setCenter: (longitude: number, latitude: number) => {
        s.center = [longitude, latitude];
        s.longitude = longitude;
        s.latitude = latitude;
      },
      setRotation: (rotation: number) => {
        s.rotation = rotation;
      },
      setScale: (scale: number) => {
        s.scale = Math.max(0.1, Math.min(10, scale));
      },
      suggestProjectionForCurrentData: () => {
        const geoDatasets = datasetsStore.getDatasetsByType(true);
        if (geoDatasets.length === 0) return;

        const firstDataset = geoDatasets[0];
        if (!firstDataset.geometry?.bounds) return;

        const bounds: [[number, number], [number, number]] = [
          [firstDataset.geometry.bounds[0], firstDataset.geometry.bounds[1]],
          [firstDataset.geometry.bounds[2], firstDataset.geometry.bounds[3]]
        ];

        const suggested = suggestProjection(bounds);
        setSelected(suggested);
      },
      applyProjectionToDataset: (
        datasetId: string,
        width: number,
        height: number
      ): FeatureCollection | null => {
        const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
        if (!dataset || !dataset.data) return null;

        const features: Feature<Geometry, Record<string, unknown>>[] =
          dataset.data
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
              (
                feature
              ): feature is Feature<Geometry, Record<string, unknown>> =>
                feature !== null
            );

        if (features.length === 0) {
          return null;
        }

        const geojson: FeatureCollection<Geometry, Record<string, unknown>> = {
          type: 'FeatureCollection',
          features
        };

        if (s.autoFit) {
          const projection = fitProjectionToGeoJSON(
            geojson,
            s.selected,
            width,
            height
          );

          const projected = projectGeoJSON(geojson, s.selected, {
            scale: projection.scale(),
            translate: projection.translate(),
            rotate: [s.rotation, 0, 0],
            center: s.center
          });

          return projected.type === 'FeatureCollection' ? projected : null;
        }

        const projected = projectGeoJSON(geojson, s.selected, {
          scale: (s.scale || 1) * 100,
          translate: [width / 2, height / 2],
          rotate: [s.rotation, 0, 0],
          center: s.center || [s.longitude, s.latitude]
        });

        return projected.type === 'FeatureCollection' ? projected : null;
      },
      getCurrentProjectionInfo: (): ProjectionInfo | undefined => {
        return getProjectionById(s.selected);
      }
    };
  }
);

export const projectionActions = actions;
