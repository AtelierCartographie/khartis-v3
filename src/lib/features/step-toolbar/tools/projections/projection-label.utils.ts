import { getProjectionById } from '$lib/features/commons/utils/projection.utils';
import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
import type { ProjectionFilterId } from '$lib/features/commons/types/global';
import * as m from '$lib/paraglide/messages';
import { inferProjectionIdFromCode } from './projection-code.utils';
import {
  getCatalogueProjectionIdForD3Config,
  getCatalogueProjectionIdForSuggestion
} from './projection-suggestion-catalogue.utils';
import type { ProjectionSuggestion } from './projection-suggest.service';
import type { ProjectionState } from '../../types/projections.types';

export function getSuggestionProjectionTitle(
  suggestion: ProjectionSuggestion
): string {
  const projectionId = getCatalogueProjectionIdForSuggestion(suggestion);
  const catalogueName = projectionId
    ? getProjectionById(projectionId)?.name
    : undefined;

  return catalogueName ?? suggestion.name;
}

export function getSuggestionProjectionDescription(
  suggestion: ProjectionSuggestion
): string {
  if (suggestion.type === 'national' && suggestion.epsg) {
    return `${m.projection_tag_national()} · EPSG:${suggestion.epsg}`;
  }

  const projectionId = getCatalogueProjectionIdForSuggestion(suggestion);
  const description = projectionId
    ? getProjectionById(projectionId)?.description
    : undefined;

  return description ?? m.projection_description();
}

export type ProjectionShapeFilterId = Exclude<ProjectionFilterId, 'all'>;

const SHAPE_FILTER_IDS: Record<string, ProjectionShapeFilterId> = {
  rectangular: 'Rectangulaire',
  round: 'Arrondie',
  discontinuous: 'Discontinue'
};

export function getProjectionShapeFilterId(
  shape: string | undefined
): ProjectionShapeFilterId | undefined {
  return shape ? SHAPE_FILTER_IDS[shape] : undefined;
}

const COMPOSITE_PROJECTION_NAMES: Record<string, () => string> = {
  FRANCE_DOM_TOM: () => m.projection_name_france_dom_tom(),
  EUROPE_DOM_TOM: () => m.projection_name_europe_dom_tom(),
  USA_ALBERS: () => m.projection_name_usa_albers()
};

export function getCompositeProjectionName(
  presetId: string
): string | undefined {
  return COMPOSITE_PROJECTION_NAMES[presetId]?.();
}

export interface CurrentProjectionDisplay {
  name: string;
  description?: string;
}

export interface BasemapProjectionSource {
  type?: string;
  preset?: string | null;
  proj4?: string | null;
}

// The rendered projection can come from five places: the reference basemap
// itself while no override is active, a ranked suggestion, a suggestion
// restored from a reopened project (only its d3 config survives), a user CRS
// code, or the catalogue. All five must be nameable.
export function resolveCurrentProjectionDisplay(
  state: ProjectionState,
  basemapProjection?: BasemapProjectionSource | null
): CurrentProjectionDisplay {
  if (state.overrideActive !== true) {
    return resolveBasemapProjectionDisplay(basemapProjection);
  }

  const suggestion = findActiveSuggestion(state);
  if (suggestion) {
    return {
      name: getSuggestionProjectionTitle(suggestion),
      description: getSuggestionProjectionDescription(suggestion)
    };
  }

  const suggestionProjection = getProjectionForId(
    getCatalogueProjectionIdForD3Config(state.suggestionD3Config)
  );
  if (suggestionProjection) {
    return suggestionProjection;
  }

  if (state.customCode) {
    return resolveProjectionCodeDisplay(state.customCode);
  }

  const presetId = getCompositeProjectionPresetId(state.selected);
  if (presetId) {
    return { name: getCompositeProjectionName(presetId) ?? state.selected };
  }

  return getProjectionForId(state.selected) ?? { name: state.selected };
}

function resolveBasemapProjectionDisplay(
  source: BasemapProjectionSource | null | undefined
): CurrentProjectionDisplay {
  if (source?.type === 'composite' && source.preset) {
    return { name: getCompositeProjectionName(source.preset) ?? source.preset };
  }

  if (source?.type === 'simple' && source.proj4) {
    return resolveProjectionCodeDisplay(source.proj4);
  }

  return { name: m.projection_current_basemap_native() };
}

function resolveProjectionCodeDisplay(code: string): CurrentProjectionDisplay {
  return (
    getProjectionForId(inferProjectionIdFromCode(code)) ?? {
      name: m.projection_current_custom_code(),
      description: code
    }
  );
}

function getProjectionForId(
  projectionId: string | undefined
): CurrentProjectionDisplay | undefined {
  const projection = projectionId ? getProjectionById(projectionId) : undefined;
  return projection
    ? { name: projection.name, description: projection.description }
    : undefined;
}

function findActiveSuggestion(
  state: ProjectionState
): ProjectionSuggestion | undefined {
  const { activeSuggestionId, suggestions } = state;
  if (!activeSuggestionId || !suggestions) {
    return undefined;
  }

  return [...suggestions.national, ...suggestions.generic].find(
    (suggestion) => suggestion.id === activeSuggestionId
  );
}
