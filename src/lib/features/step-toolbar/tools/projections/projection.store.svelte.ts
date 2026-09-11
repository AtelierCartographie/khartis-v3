import {
  suggestProjectionsForBbox,
  suggestProjectionsForFeatureBounds,
  buildProjectionFromSuggestion,
  type ProjectionSuggestion
} from './projection-suggest.service';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { canUseBoundsForProjectionSuggestion } from '$lib/features/map/utils/dataset-crs.utils';
import {
  resolveProjectionAvailabilityContext,
  resolveProjectionSuggestionBoundsFromBasemap,
  supportsCustomProjectionCode,
  supportsProjectionSuggestions
} from '$lib/features/map/utils/projection-availability.utils';
import {
  getCompositeProjectionSelectionId,
  usesMercatorMapProjection
} from '$lib/features/map/utils/user-projection.utils';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { globalActions } from '$lib/features/commons/stores/global.svelte';
import {
  getProjectionById,
  resolveProjectionDefaultOrientation,
  type ProjectionInfo
} from '$lib/features/commons/utils/projection.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import {
  basemapService,
  mapProjectionStore,
  osmBasemapStore,
  projectionStore as mapRenderProjectionStore
} from '$lib/features/map';
import type { ProjectionState } from '../../types/projections.types';
import type { D3Usage } from '@ateliercartographie/proj-suggest';

const DEFAULT_PROJECTION = 'mercator';

const DEFAULT_STATE: ProjectionState = {
  selected: DEFAULT_PROJECTION,
  overrideActive: false,
  overrideSource: undefined,
  viewMode: ViewMode.LIST,
  longitude: 0,
  latitude: 0,
  rotation: 0,
  center: undefined,
  customCode: undefined,
  activeSuggestionId: undefined,
  suggestionD3Config: undefined,
  suggestionScale: undefined,
  suggestions: undefined
};

let suggestionRequestId = 0;

type ProjectionActions = {
  setSelected: (projectionId: string) => void;
  toggleSelected: (projectionId: string) => void;
  setCustomCode: (code: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setCenter: (longitude: number, latitude: number) => void;
  setRotation: (rotation: number) => void;
  resetSettings: () => void;
  suggestProjectionForCurrentData: () => Promise<void>;
  applySuggestion: (suggestion: ProjectionSuggestion) => void;
  applyBasemapPreferredProjection: () => void;
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

type SuggestionBounds =
  | { kind: 'single'; bbox: [number, number, number, number] }
  | { kind: 'features'; boxes: Array<[number, number, number, number]> };

async function resolveSuggestionBounds(): Promise<SuggestionBounds | null> {
  const candidates = getSuggestionCandidates();

  for (const dataset of candidates) {
    const duckDataset = dataset.sourceFileId
      ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
      : null;

    // Prefer the per-feature bbox proxy: passing one bbox per feature lets
    // proj-suggest discard detached territories (Alaska, DOM-TOM…) that would
    // otherwise inflate the extent to world scale. Geometry is stored in its
    // source CRS, so a non-WGS84 dataset is reprojected to WGS84 in DuckDB.
    if (duckDataset) {
      const featureBounds =
        await duckDBOrchestrator.getGeometryPerFeatureBounds(duckDataset.id, {
          reprojectToWgs84: !canUseBoundsForProjectionSuggestion(
            dataset.geometry?.crs
          )
        });
      if (featureBounds && featureBounds.length > 1) {
        return { kind: 'features', boxes: featureBounds };
      }
    }

    // WGS84-like datasets already carry WGS84 bounds — use them directly, no
    // DuckDB round-trip. Non-WGS84 sources fall through to getGeometryExtent,
    // which reprojects to WGS84 via ST_Transform (PROJ).
    if (
      dataset.geometry?.bounds &&
      canUseBoundsForProjectionSuggestion(dataset.geometry.crs)
    ) {
      return { kind: 'single', bbox: dataset.geometry.bounds };
    }

    if (!duckDataset) {
      continue;
    }

    const gpsBounds = await duckDBOrchestrator.getGPSBounds(duckDataset.id);
    if (gpsBounds) {
      return { kind: 'single', bbox: toBoundsFromGpsBounds(gpsBounds) };
    }

    const geomExtent = await duckDBOrchestrator.getGeometryExtent(
      duckDataset.id
    );
    if (geomExtent) {
      return { kind: 'single', bbox: geomExtent };
    }
  }

  const basemapBounds = resolveProjectionSuggestionBoundsFromBasemap({
    currentStyle: basemapStyleStore.selectedStyle,
    preferredStyle: basemapStyleStore.preferredTiledStyle,
    referenceBasemapBbox: basemapStyleStore.referenceBasemapId
      ? (basemapService.currentMetadata?.bbox ?? null)
      : null,
    currentBasemapBbox: basemapService.currentMetadata?.bbox ?? null,
    osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null
  });

  return basemapBounds ? { kind: 'single', bbox: basemapBounds } : null;
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
      if (!s.overrideActive) {
        // Capture the basemap's effective projection so settings rotate it
        // instead of silently switching the render to `selected` (mercator).
        const projTo = basemapService.currentMetadata?.proj_to;
        if (projTo?.type === 'simple' && projTo.proj4) {
          s.customCode = projTo.proj4;
        }
      }
      s.activeSuggestionId = undefined;
      s.overrideActive = true;
      s.overrideSource = 'manual';
    };

    const seedOrientationFromProjection = () => {
      const [longitude, latitude] = resolveProjectionDefaultOrientation({
        selected: s.selected,
        customCode: s.customCode,
        suggestionD3Config: s.suggestionD3Config
      });
      s.longitude = longitude;
      s.latitude = latitude;
      s.rotation = 0;
      s.center =
        longitude === 0 && latitude === 0 ? undefined : [longitude, latitude];
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
      seedOrientationFromProjection();
      if (applyToMap) {
        mapProjectionStore.setProjection(toMapProjectionType(projectionId), {
          explicit: true
        });
      }
    };

    const clearSelectedInternal = (applyToMap: boolean) => {
      s.selected = DEFAULT_PROJECTION;
      s.customCode = undefined;
      s.suggestionD3Config = undefined;
      s.activeSuggestionId = undefined;
      s.overrideActive = false;
      s.overrideSource = undefined;
      seedOrientationFromProjection();
      if (applyToMap) {
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
      }
    };

    const setSelected = (projectionId: string) => {
      setSelectedInternal(projectionId, true);
    };

    const applyBasemapPreferredProjection = (): void => {
      if (s.overrideSource === 'manual') {
        return;
      }
      const projectionMetadata = basemapService.currentMetadata?.proj_to;
      const presetId = projectionMetadata?.preset;
      if (!presetId) {
        return;
      }
      const projectionId =
        projectionMetadata.type === 'composite'
          ? getCompositeProjectionSelectionId(presetId)
          : presetId;
      if (s.selected === projectionId) {
        return;
      }
      setSelectedInternal(projectionId, true, 'auto');
    };

    return {
      setSelected,
      applyBasemapPreferredProjection,
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
        seedOrientationFromProjection();
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
      },
      setRotation: (rotation: number) => {
        s.rotation = rotation;
        activateManualProjectionOverride();
      },
      resetSettings: () => {
        if (
          s.overrideSource === 'manual' &&
          s.customCode &&
          s.customCode === basemapService.currentMetadata?.proj_to?.proj4
        ) {
          s.customCode = undefined;
          s.overrideActive = false;
          s.overrideSource = undefined;
        }
        seedOrientationFromProjection();
      },
      suggestProjectionForCurrentData: async () => {
        const requestId = ++suggestionRequestId;
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

        const result =
          bounds.kind === 'features'
            ? suggestProjectionsForFeatureBounds(bounds.boxes)
            : suggestProjectionsForBbox(bounds.bbox);

        if (!result) return;

        if (requestId !== suggestionRequestId) {
          return;
        }

        s.suggestions = result;

        if (s.overrideSource === 'auto') {
          clearSelectedInternal(true);
        }
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
        s.suggestionScale = undefined;
        s.activeSuggestionId = activeSuggestionId;
        s.selected = DEFAULT_PROJECTION;
        s.overrideActive = true;
        s.overrideSource = overrideSource;
        seedOrientationFromProjection();
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
        return;
      }

      if (builtProjection?.source === 'd3' && suggestion.d3Config) {
        s.selected = DEFAULT_PROJECTION;
        s.customCode = undefined;
        s.suggestionD3Config = cloneD3UsageConfig(suggestion.d3Config);
        s.suggestionScale = suggestion.scale;
        s.activeSuggestionId = activeSuggestionId;
        s.overrideActive = true;
        s.overrideSource = overrideSource;
        seedOrientationFromProjection();
        mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);
        return;
      }
    }
  },
  {
    key: 'projection',
    serializeFilter: ({ suggestions: _suggestions, ...persisted }) => persisted
  }
);

export const projectionActions = actions;
export const getProjectionState = getState;
