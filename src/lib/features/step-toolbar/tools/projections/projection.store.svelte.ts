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
import { projectionStore as mapRenderProjectionStore } from '$lib/features/map/stores/projection.store.svelte';
import type { ProjectionState } from './projections.types';
import {
  suggestProjectionsForBbox,
  buildProjectionFromSuggestion,
  type ProjectionSuggestion
} from './projection-suggest.service';
import type { D3Usage } from 'proj-suggest';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { normalizeBoundsForProjectionSuggestion } from '$lib/features/map/utils/dataset-crs';
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

/** Counter to discard stale async suggestion results. */
let suggestionRequestId = 0;

type ProjectionActions = {
  setSelected: (projectionId: string) => void;
  toggleSelected: (projectionId: string) => void;
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

function cloneD3UsageConfig(config: D3Usage): D3Usage {
  return {
    projection: config.projection,
    ...(config.rotate ? { rotate: [...config.rotate] } : {}),
    ...(config.center ? { center: [...config.center] } : {}),
    ...(config.parallels ? { parallels: [...config.parallels] } : {}),
    ...(config.snippet ? { snippet: config.snippet } : {})
  };
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
    referenceProjectionPresetId: basemapStyleStore.referenceBasemapId
      ? (basemapService.currentMetadata?.proj_to?.preset ?? null)
      : null,
    osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null,
    projectionBbox: mapRenderProjectionStore.isProjectedCoordinates
      ? null
      : mapRenderProjectionStore.referenceBbox,
    projectionPresets: basemapService.projectionPresets
  });
}

async function resolveSuggestionBounds(): Promise<
  [number, number, number, number] | null
> {
  const candidates = getSuggestionCandidates();

  for (const dataset of candidates) {
    if (dataset.geometry?.bounds) {
      const normalizedBounds = normalizeBoundsForProjectionSuggestion(
        dataset.geometry.bounds,
        dataset.geometry.crs
      );
      if (normalizedBounds) {
        return normalizedBounds;
      }
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
    const activateManualProjectionOverride = () => {
      s.overrideActive = true;
      s.overrideSource = 'manual';
    };

    const setSelectedInternal = (
      projectionId: string,
      applyToMap: boolean,
      overrideSource: ProjectionState['overrideSource'] = 'manual'
    ) => {
      s.selected = projectionId;
      s.customCode = undefined;
      s.suggestionD3Config = undefined;
      s.activeSuggestionId = undefined;
      s.overrideActive = overrideSource !== undefined;
      s.overrideSource = overrideSource;
      if (applyToMap) {
        mapProjectionStore.setProjection(toMapProjectionType(projectionId));
      }
    };

    const clearSelectedInternal = (applyToMap: boolean) => {
      s.selected = DEFAULT_PROJECTION;
      s.customCode = undefined;
      s.suggestionD3Config = undefined;
      s.activeSuggestionId = undefined;
      s.overrideActive = false;
      s.overrideSource = undefined;
      if (applyToMap) {
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
      }
    };

    const setSelected = (projectionId: string) => {
      setSelectedInternal(projectionId, true);
    };

    return {
      setSelected,
      toggleSelected: (projectionId: string) => {
        if (s.overrideActive && !s.customCode && s.selected === projectionId) {
          clearSelectedInternal(true);
          return;
        }

        setSelectedInternal(projectionId, true);
      },
      setCustomCode: (code: string | null) => {
        if (!supportsCustomProjectionCode(getProjectionAvailabilityContext())) {
          return;
        }

        s.customCode = code?.trim() || undefined;
        s.suggestionD3Config = undefined;
        s.activeSuggestionId = undefined;
        s.overrideActive = Boolean(s.customCode);
        s.overrideSource = s.customCode ? 'manual' : undefined;
        if (s.customCode) {
          mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
        }
      },
      setViewMode: (mode: ViewMode) => {
        s.viewMode = mode;
        globalActions.setProjectionViewMode(mode);
      },
      setCenter: (longitude: number, latitude: number) => {
        s.center = [longitude, latitude];
        s.longitude = longitude;
        s.latitude = latitude;
        activateManualProjectionOverride();

        const map = mapInstanceStore.map;
        if (map) {
          map.setCenter([longitude, latitude]);
        }
      },
      setRotation: (rotation: number) => {
        s.rotation = rotation;
        activateManualProjectionOverride();

        const map = mapInstanceStore.map;
        if (map) {
          map.setBearing(rotation);
        }
      },
      setSimplifiedPreview: (value: boolean) => {
        s.simplifiedPreview = value;
      },
      suggestProjectionForCurrentData: () => {
        const requestId = ++suggestionRequestId;
        void (async () => {
          if (
            !supportsProjectionSuggestions(getProjectionAvailabilityContext())
          ) {
            if (requestId === suggestionRequestId) {
              s.suggestions = undefined;
            }
            return;
          }

          const bounds = await resolveSuggestionBounds();
          if (!bounds) return;

          const result = suggestProjectionsForBbox(bounds);

          if (!result) return;

          // Ignore stale results from superseded calls.
          if (requestId !== suggestionRequestId) {
            logger.info(
              'Stale projection suggestions discarded',
              LogCategory.MAP,
              { requestId, current: suggestionRequestId }
            );
            return;
          }

          s.suggestions = result;

          logger.info('Projection suggestions computed', LogCategory.MAP, {
            national: result.national.length,
            generic: result.generic.length,
            bbox: bounds
          });

          if (s.overrideSource === 'auto') {
            clearSelectedInternal(true);
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
      if (
        overrideSource === 'manual' &&
        s.overrideActive &&
        s.activeSuggestionId === suggestion.id
      ) {
        clearSelectedInternal(true);
        return;
      }

      const builtProjection = buildProjectionFromSuggestion(suggestion);
      const activeSuggestionId = suggestion.id;

      if (builtProjection?.source === 'proj4' && suggestion.proj4String) {
        s.customCode = suggestion.proj4String;
        s.suggestionD3Config = undefined;
        s.activeSuggestionId = activeSuggestionId;
        s.selected = DEFAULT_PROJECTION;
        s.overrideActive = true;
        s.overrideSource = overrideSource;
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
        logger.info(
          'Applied projection suggestion via proj4',
          LogCategory.MAP,
          {
            id: suggestion.id,
            epsg: suggestion.epsg,
            bbox: suggestion.bbox
          }
        );
        return;
      }

      // Suggestions that fell back to d3 must preserve the suggester's native
      // rotation/parallels instead of collapsing to a generic internal preset.
      if (builtProjection?.source === 'd3' && suggestion.d3Config) {
        s.selected = DEFAULT_PROJECTION;
        s.customCode = undefined;
        s.suggestionD3Config = cloneD3UsageConfig(suggestion.d3Config);
        s.activeSuggestionId = activeSuggestionId;
        s.overrideActive = true;
        s.overrideSource = overrideSource;
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
        logger.info(
          'Applied projection suggestion via d3 mapping',
          LogCategory.MAP,
          {
            id: suggestion.id,
            epsg: suggestion.epsg,
            bbox: suggestion.bbox,
            d3Projection: suggestion.d3Config.projection
          }
        );
        return;
      }

      logger.warn('Could not apply projection suggestion', LogCategory.MAP, {
        id: suggestion.id
      });
    }
  },
  {
    key: 'projection',
    serializeFilter: ({
      suggestions: _suggestions,
      activeSuggestionId: _activeSuggestionId,
      ...persisted
    }) => persisted
  }
);

export const projectionActions = actions;
export const getProjectionState = getState;
