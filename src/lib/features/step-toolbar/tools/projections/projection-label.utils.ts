import { getProjectionById } from '$lib/features/commons/utils/projection.utils';
import { getKnownEpsgName } from '$lib/features/commons/utils/proj4-crs.utils';
import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
import type { ProjectionFilterId } from '$lib/features/commons/types/global';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import type { ProjectionPresets } from '$lib/features/map/types/basemap.types';
import {
  describeProjectionCode,
  inferProjectionIdFromCode,
  type ProjectionCodeCrs,
  wrapLongitude
} from './projection-code.utils';
import { getProjectionCodeCentralMeridian } from '$lib/features/commons/utils/proj4-crs.utils';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import { findNativeSuggestion } from './native-projection.utils';
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

// Official name a preset gives its projection (name_fr / name_en, written by
// khartis-basemaps), in the current locale.
export function getPresetOfficialProjectionName(
  presetId: string,
  projectionPresets?: ProjectionPresets | null
): string | undefined {
  const preset = projectionPresets?.[presetId];
  return getLocale() === 'en'
    ? (preset?.name_en ?? preset?.name_fr)
    : (preset?.name_fr ?? preset?.name_en);
}

// A preset names its projection itself (name_fr/name_en + epsg, written by
// khartis-basemaps); the hard-coded names cover the older presets, and the raw
// id stays the last resort.
function resolvePresetProjectionDisplay(
  presetId: string,
  projectionPresets?: ProjectionPresets | null
): CurrentProjectionDisplay {
  const preset = projectionPresets?.[presetId];
  const officialName = getPresetOfficialProjectionName(
    presetId,
    projectionPresets
  );
  const name = officialName ?? getCompositeProjectionName(presetId) ?? presetId;
  return preset?.epsg
    ? {
        name,
        description: `${m.projection_tag_national()} · EPSG:${preset.epsg}`
      }
    : { name };
}

export interface CurrentProjectionDisplay {
  name: string;
  description?: string;
}

export interface BasemapProjectionSource {
  type?: string;
  preset?: string | null;
  proj4?: string | null;
  /** CRS the file is drawn in as is: an EPSG code or a PROJJSON. */
  nativeCrs?: string;
  nativeEpsg?: string;
}

// The rendered projection can come from five places: the reference basemap
// itself while no override is active, a ranked suggestion, a suggestion
// restored from a reopened project (only its d3 config survives), a user CRS
// code, or the catalogue. All five must be nameable.
export function resolveCurrentProjectionDisplay(
  state: ProjectionState,
  basemapProjection?: BasemapProjectionSource | null,
  projectionPresets?: ProjectionPresets | null
): CurrentProjectionDisplay {
  // Only a manual override is rendered (projection-priority.utils.ts): an
  // 'auto' one is the basemap's own composite, possibly left over from a
  // previous basemap, and must not rename the projection actually drawn.
  if (state.overrideActive !== true || state.overrideSource !== 'manual') {
    const nativeSuggestion = findNativeSuggestion(
      state.suggestions,
      basemapProjection?.nativeEpsg
    );
    if (nativeSuggestion) {
      return {
        name: getSuggestionProjectionTitle(nativeSuggestion),
        description: getSuggestionProjectionDescription(nativeSuggestion)
      };
    }
    return resolveBasemapProjectionDisplay(
      basemapProjection,
      projectionPresets
    );
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
    return resolveUserCodeDisplay(state);
  }

  const presetId = getCompositeProjectionPresetId(state.selected);
  if (presetId) {
    return resolvePresetProjectionDisplay(presetId, projectionPresets);
  }

  return getProjectionForId(state.selected) ?? { name: state.selected };
}

function resolveBasemapProjectionDisplay(
  source: BasemapProjectionSource | null | undefined,
  projectionPresets?: ProjectionPresets | null
): CurrentProjectionDisplay {
  if (source?.type === 'composite' && source.preset) {
    return resolvePresetProjectionDisplay(source.preset, projectionPresets);
  }

  if (source?.type === 'simple' && source.proj4) {
    return resolveProjectionCodeDisplay(source.proj4);
  }

  if (!source?.nativeEpsg) {
    // A `.prj` without authority (Esri WKT) still names its CRS.
    const crs = source?.nativeCrs
      ? describeProjectionCode(source.nativeCrs)
      : undefined;
    return crs
      ? {
          name: crs.name ?? m.projection_current_basemap_native(),
          description: formatProjectionCodeCrs(crs)
        }
      : { name: m.projection_current_basemap_native() };
  }
  // The file is drawn in its own CRS: name it once the PROJ database has.
  const code = `EPSG:${source.nativeEpsg}`;
  const crs = describeProjectionCode(code);
  return {
    name: getKnownEpsgName(code) ?? m.projection_current_basemap_native(),
    description: crs ? formatProjectionCodeCrs(crs) : code
  };
}

export function formatProjectionCodeCrs(crs: ProjectionCodeCrs): string {
  return [
    crs.epsg ? `EPSG:${crs.epsg}` : undefined,
    crs.method,
    crs.datum ?? crs.ellipsoid,
    crs.units
  ]
    .filter(Boolean)
    .join(' · ');
}

export function getProjectionCodeDisplayName(
  code: string,
  crs: ProjectionCodeCrs
): string {
  return (
    crs.name ??
    (crs.epsg ? `EPSG:${crs.epsg}` : undefined) ??
    getProjectionForId(inferProjectionIdFromCode(code))?.name ??
    (crs.method || m.projection_current_custom_code())
  );
}

// A pasted CRS is named after itself (EPSG registry, WKT/PROJJSON name), so an
// expert can match it against the CRS of a QGIS or ArcGIS export; the
// orientation settings rotate the sphere before proj4 and break that match.
function resolveUserCodeDisplay(
  state: ProjectionState
): CurrentProjectionDisplay {
  const code = state.customCode ?? '';
  const crs = describeProjectionCode(code);
  if (!crs) {
    return resolveProjectionCodeDisplay(code);
  }

  const name = getProjectionCodeDisplayName(code, crs);
  const reoriented = state.latitude !== 0 || state.rotation !== 0;
  const centralMeridian =
    state.longitude !== 0
      ? wrapLongitude(getProjectionCodeCentralMeridian(code) + state.longitude)
      : undefined;

  return {
    name,
    description: [
      formatProjectionCodeCrs(crs),
      centralMeridian !== undefined
        ? m.projection_current_crs_central_meridian({
            longitude: formatValue(centralMeridian, { maxFractionDigits: 2 })
          })
        : undefined,
      reoriented ? m.projection_current_crs_reoriented() : undefined
    ]
      .filter(Boolean)
      .join(' — ')
  };
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
