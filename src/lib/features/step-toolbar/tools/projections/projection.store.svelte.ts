import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import { globalActions } from '$lib/features/commons/store/global.svelte';
import {
  getProjectionById,
  type ProjectionInfo
} from '$lib/features/commons/utils/projection.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import type { ProjectionState } from './projections.types';
import {
  suggestProjectionsForBbox,
  buildProjectionFromSuggestion,
  type ProjectionSuggestion
} from './projection-suggest.service';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { canUseBoundsForProjectionSuggestion } from '$lib/features/map/utils/dataset-crs';
import {
  resolveProjectionAvailabilityContext,
  resolveProjectionSuggestionBoundsFromBasemap,
  supportsCustomProjectionCode,
  supportsProjectionSuggestions
} from '$lib/features/map/utils/projection-availability';
import { usesMercatorMapProjection } from '$lib/features/map/utils/user-projection.utils';

const DEFAULT_PROJECTION = 'mercator';

const DEFAULT_STATE: ProjectionState = {
  selected: DEFAULT_PROJECTION,
  overrideActive: false,
  overrideSource: undefined,
  viewMode: ViewMode.LIST,
  longitude: 0,
  latitude: 0,
  rotation: 0,
  simplifiedPreview: true
};

type ProjectionActions = {
  setSelected: (projectionId: string) => void;
  setCustomCode: (code: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setCenter: (longitude: number, latitude: number) => void;
  setRotation: (rotation: number) => void;
  setSimplifiedPreview: (value: boolean) => void;
  suggestProjectionForCurrentData: () => void;
  applySuggestion: (suggestion: ProjectionSuggestion) => void;
  getCurrentProjectionInfo: () => ProjectionInfo | undefined;
};

const MERCATOR_PROJECTION_TYPE = 'mercator';

function toBoundsTuple(
  bounds: [number, number, number, number]
): [number, number, number, number] {
  return [bounds[0], bounds[1], bounds[2], bounds[3]];
}

function toBoundsFromGpsBounds(gpsBounds: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): [number, number, number, number] {
  return [
    gpsBounds.minLon,
    gpsBounds.minLat,
    gpsBounds.maxLon,
    gpsBounds.maxLat
  ];
}

function getSuggestionCandidates(): DatasetResult[] {
  const candidates: DatasetResult[] = [];
  const seen = new Set<string>();

  const pushCandidate = (dataset: DatasetResult | null | undefined) => {
    if (!dataset || seen.has(dataset.id)) {
      return;
    }

    seen.add(dataset.id);
    candidates.push(dataset);
  };

  pushCandidate(datasetsStore.selectedDataset);

  for (const dataset of datasetsStore.getDatasetsByType(true)) {
    pushCandidate(dataset);
  }

  for (const dataset of datasetsStore.enabledDatasets) {
    pushCandidate(dataset);
  }

  for (const dataset of datasetsStore.datasets) {
    pushCandidate(dataset);
  }

  return candidates;
}

function getProjectionAvailabilityContext() {
  return resolveProjectionAvailabilityContext({
    requiresMapLibre: basemapStyleStore.requiresMapLibre,
    hasOSMBasemap: osmBasemapStore.isActive,
    currentStyle: basemapStyleStore.selectedStyle,
    preferredStyle: basemapStyleStore.preferredTiledStyle,
    referenceBasemapId: basemapStyleStore.referenceBasemapId,
    osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null
  });
}

async function resolveSuggestionBounds(): Promise<
  [number, number, number, number] | null
> {
  const candidates = getSuggestionCandidates();

  for (const dataset of candidates) {
    if (
      dataset.geometry?.bounds &&
      canUseBoundsForProjectionSuggestion(dataset.geometry.crs)
    ) {
      return toBoundsTuple(dataset.geometry.bounds);
    }

    if (!dataset.sourceFileId) {
      continue;
    }

    const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
      dataset.sourceFileId
    );
    if (!duckDataset) {
      continue;
    }

    const gpsBounds = await duckDBOrchestrator.getGPSBounds(duckDataset.id);
    if (gpsBounds) {
      return toBoundsFromGpsBounds(gpsBounds);
    }
  }

  return resolveProjectionSuggestionBoundsFromBasemap({
    currentStyle: basemapStyleStore.selectedStyle,
    preferredStyle: basemapStyleStore.preferredTiledStyle,
    referenceBasemapBbox: basemapStyleStore.referenceBasemapId
      ? (basemapService.currentMetadata?.bbox ?? null)
      : null,
    currentBasemapBbox: basemapService.currentMetadata?.bbox ?? null,
    osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null
  });
}

function toMapProjectionType(projectionId: string): 'mercator' | 'globe' {
  return usesMercatorMapProjection(projectionId)
    ? MERCATOR_PROJECTION_TYPE
    : 'globe';
}

const { actions, getState } = createToolStore<
  ProjectionState,
  ProjectionActions
>(
  DEFAULT_STATE,
  (s) => {
    const setSelectedInternal = (
      projectionId: string,
      applyToMap: boolean,
      overrideSource: ProjectionState['overrideSource'] = 'manual'
    ) => {
      s.selected = projectionId;
      s.customCode = undefined;
      s.overrideActive = overrideSource !== undefined;
      s.overrideSource = overrideSource;
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
        if (!supportsCustomProjectionCode(getProjectionAvailabilityContext())) {
          return;
        }

        s.customCode = code?.trim() || undefined;
        s.overrideActive = Boolean(s.customCode);
        s.overrideSource = s.customCode ? 'manual' : undefined;
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
      setSimplifiedPreview: (value: boolean) => {
        s.simplifiedPreview = value;
      },
      suggestProjectionForCurrentData: () => {
        void (async () => {
          if (
            !supportsProjectionSuggestions(getProjectionAvailabilityContext())
          ) {
            s.suggestions = undefined;
            return;
          }

          const bounds = await resolveSuggestionBounds();
          if (!bounds) return;

          const result = suggestProjectionsForBbox(bounds);

          if (!result) return;

          s.suggestions = result;

          logger.info('Projection suggestions computed', LogCategory.MAP, {
            national: result.national.length,
            generic: result.generic.length,
            bbox: bounds
          });

          // National projections trump generic ones because "Nationale" gathers
          // officially endorsed CRSes per zone (Lambert-93 for France, etc.).
          // Ties inside each list have already been broken by the upstream
          // suggester, so picking the first item is the canonical default.
          const best = result.national[0] ?? result.generic[0];
          if (best) {
            applyProjectionSuggestion(best, 'auto');
          }
        })();
      },
      applySuggestion: (suggestion: ProjectionSuggestion) => {
        if (
          !supportsProjectionSuggestions(getProjectionAvailabilityContext())
        ) {
          return;
        }

        applyProjectionSuggestion(suggestion, 'manual');
      },
      getCurrentProjectionInfo: (): ProjectionInfo | undefined => {
        return getProjectionById(s.selected);
      }
    };

    function applyProjectionSuggestion(
      suggestion: ProjectionSuggestion,
      overrideSource: ProjectionState['overrideSource']
    ) {
      const builtProjection = buildProjectionFromSuggestion(suggestion);

      if (builtProjection?.source === 'proj4' && suggestion.proj4String) {
        s.customCode = suggestion.proj4String;
        s.selected = 'mercator'; // proj4 projections render in orthographic/mercator view
        s.overrideActive = true;
        s.overrideSource = overrideSource;
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
        logger.info(
          'Applied projection suggestion via proj4',
          LogCategory.MAP,
          {
            id: suggestion.id,
            epsg: suggestion.epsg
          }
        );
        return;
      }

      // Suggestions that fell back to d3 must stay on the preset-projection path.
      if (builtProjection?.source === 'd3' && suggestion.d3Config) {
        const internalId = mapD3FactoryToInternalId(
          suggestion.d3Config.projection
        );
        if (internalId) {
          setSelectedInternal(internalId, true, overrideSource);
          logger.info(
            'Applied projection suggestion via d3 mapping',
            LogCategory.MAP,
            { id: suggestion.id, internalId }
          );
          return;
        }
      }

      logger.warn('Could not apply projection suggestion', LogCategory.MAP, {
        id: suggestion.id
      });
    }
  },
  {
    key: 'projection',
    serializeFilter: ({ suggestions: _suggestions, ...persisted }) => persisted
  }
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
    geoEqualEarth: 'equal-earth',
    geoMollweide: 'mollweide',
    geoAitoff: 'aitoff',
    geoWinkel3: 'winkel-tripel',
    geoCylindricalEqualArea: 'gall-peters',
    geoBonne: 'bonne',
    geoArmadillo: 'armadillo',
    geoBertin1953: 'bertin-1953',
    geoInterruptedMollweide: 'interrupted-mollweide'
  };
  return mapping[factoryName] ?? null;
}

export const projectionActions = actions;
export const getProjectionState = getState;
