import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { globalActions } from '$lib/features/commons/store/global.svelte';
import {
  fitProjectionToGeoJSON,
  getProjectionById,
  projectGeoJSON,
  type ProjectionInfo
} from '$lib/features/commons/utils/projection.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { ProjectionState } from './projections.types';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import {
  suggestProjectionsForBbox,
  buildProjectionFromSuggestion,
  type ProjectionSuggestion
} from './projection-suggest.service';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const DEFAULT_PROJECTION = 'mercator';

const DEFAULT_STATE: ProjectionState = {
  selected: DEFAULT_PROJECTION,
  viewMode: ViewMode.LIST,
  longitude: 0,
  latitude: 0,
  rotation: 0,
  scale: 1,
  autoFit: true,
  simplifiedPreview: true
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
  setCustomCode: (code: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setCenter: (longitude: number, latitude: number) => void;
  setRotation: (rotation: number) => void;
  setScale: (scale: number) => void;
  setSimplifiedPreview: (value: boolean) => void;
  suggestProjectionForCurrentData: () => void;
  applySuggestion: (suggestion: ProjectionSuggestion) => void;
  applyProjectionToDataset: (
    datasetId: string,
    width: number,
    height: number
  ) => FeatureCollection | null;
  getCurrentProjectionInfo: () => ProjectionInfo | undefined;
};

const MERCATOR_PROJECTION_TYPE = 'mercator';

function toMapProjectionType(projectionId: string): 'mercator' | 'globe' {
  const mercatorLike = new Set([
    MERCATOR_PROJECTION_TYPE,
    'equirectangular',
    'albers',
    'lambert-conformal',
    'rect-1',
    'rect-2',
    'rect-3'
  ]);

  return mercatorLike.has(projectionId) ? MERCATOR_PROJECTION_TYPE : 'globe';
}

const { actions, getState } = createToolStore<
  ProjectionState,
  ProjectionActions
>(
  DEFAULT_STATE,
  (s) => {
    const setSelectedInternal = (projectionId: string, applyToMap: boolean) => {
      s.selected = projectionId;
      s.customCode = undefined;
      if (applyToMap) {
        mapProjectionStore.setProjection(toMapProjectionType(projectionId));
      }
    };

    const setSelected = (projectionId: string) => {
      setSelectedInternal(projectionId, true);
    };

    return {
      setSelected,
      setCustomCode: (code: string | null) => {
        s.customCode = code?.trim() || undefined;
      },
      setViewMode: (mode: ViewMode) => {
        s.viewMode = mode;
        globalActions.setProjectionViewMode(mode);
      },
      setCenter: (longitude: number, latitude: number) => {
        s.center = [longitude, latitude];
        s.longitude = longitude;
        s.latitude = latitude;

        const map = mapInstanceStore.map;
        if (map) {
          map.setCenter([longitude, latitude]);
        }
      },
      setRotation: (rotation: number) => {
        s.rotation = rotation;

        const map = mapInstanceStore.map;
        if (map) {
          map.setBearing(rotation);
        }
      },
      setScale: (scale: number) => {
        s.scale = Math.max(0.1, Math.min(10, scale));
      },
      setSimplifiedPreview: (value: boolean) => {
        s.simplifiedPreview = value;
      },
      suggestProjectionForCurrentData: () => {
        const geoDatasets = datasetsStore.getDatasetsByType(true);
        if (geoDatasets.length === 0) return;

        const firstDataset = geoDatasets[0];
        if (!firstDataset.geometry?.bounds) return;

        const bounds = firstDataset.geometry.bounds as [
          number,
          number,
          number,
          number
        ];
        const result = suggestProjectionsForBbox(bounds);

        if (!result) return;

        s.suggestions = result;

        logger.info(
          'Projection suggestions computed',
          LogCategory.MAP,
          {
            national: result.national.length,
            generic: result.generic.length,
            bbox: bounds
          }
        );

        // Auto-apply the best suggestion: national first, then generic
        const best = result.national[0] ?? result.generic[0];
        if (best) {
          applyProjectionSuggestion(best);
        }
      },
      applySuggestion: (suggestion: ProjectionSuggestion) => {
        applyProjectionSuggestion(suggestion);
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
                type: GEOJSON_TYPE.FEATURE,
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
          type: GEOJSON_TYPE.FEATURE_COLLECTION,
          features
        };

        if (s.autoFit) {
          const projection = fitProjectionToGeoJSON(
            geojson,
            s.selected,
            width,
            height,
            20,
            s.customCode
          );

          const projected = projectGeoJSON(geojson, s.selected, {
            scale: projection.scale(),
            translate: projection.translate(),
            rotate: [s.rotation, 0, 0],
            center: s.center || [s.longitude, s.latitude],
            customCode: s.customCode
          });

          return projected.type === GEOJSON_TYPE.FEATURE_COLLECTION
            ? projected
            : null;
        }

        const projected = projectGeoJSON(geojson, s.selected, {
          scale: (s.scale || 1) * 100,
          translate: [width / 2, height / 2],
          rotate: [s.rotation, 0, 0],
          center: s.center || [s.longitude, s.latitude],
          customCode: s.customCode
        });

        return projected.type === GEOJSON_TYPE.FEATURE_COLLECTION
          ? projected
          : null;
      },
      getCurrentProjectionInfo: (): ProjectionInfo | undefined => {
        return getProjectionById(s.selected);
      }
    };

    function applyProjectionSuggestion(suggestion: ProjectionSuggestion) {
      // For proj4-based suggestions, use customCode path
      if (suggestion.proj4String) {
        const projection = buildProjectionFromSuggestion(suggestion);
        if (projection) {
          s.customCode = suggestion.proj4String;
          s.selected = 'mercator'; // proj4 projections render in orthographic/mercator view
          mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
          logger.info('Applied projection suggestion via proj4', LogCategory.MAP, {
            id: suggestion.id,
            epsg: suggestion.epsg
          });
          return;
        }
      }

      // For d3-only suggestions, try to map to an existing internal projection
      if (suggestion.d3Config) {
        const internalId = mapD3FactoryToInternalId(
          suggestion.d3Config.projection
        );
        if (internalId) {
          setSelectedInternal(internalId, true);
          logger.info(
            'Applied projection suggestion via d3 mapping',
            LogCategory.MAP,
            { id: suggestion.id, internalId }
          );
          return;
        }
      }

      logger.warn(
        'Could not apply projection suggestion',
        LogCategory.MAP,
        { id: suggestion.id }
      );
    }
  },
  { key: 'projection' }
);

/** Maps d3 factory names from proj-suggest to internal projection IDs. */
function mapD3FactoryToInternalId(factoryName: string): string | null {
  const mapping: Record<string, string> = {
    geoMercator: 'mercator',
    geoEquirectangular: 'equirectangular',
    geoNaturalEarth1: 'natural-earth',
    geoOrthographic: 'orthographic',
    geoAlbers: 'albers',
    geoConicConformal: 'lambert-conformal',
    geoRobinson: 'robinson',
    geoStereographic: 'stereographic',
    geoAzimuthalEqualArea: 'azimuthal-equal-area',
    geoEqualEarth: 'natural-earth',
    geoMollweide: 'mollweide',
    geoAitoff: 'aitoff'
  };
  return mapping[factoryName] ?? null;
}

export const projectionActions = actions;
export const getProjectionState = getState;
