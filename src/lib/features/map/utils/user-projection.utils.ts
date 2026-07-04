import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { ProjectionState } from '$lib/features/step-toolbar/tools/projections';
import type { BBox, CanvasSize } from '../types';
import type { ProjectionPresets } from '../types/basemap.types';
import { buildCompositeProjectionFromPresetId } from './geoarrow-stream-bridge.utils';
import { proj4d3 } from './proj4d3.utils';
import { type GeoProjection } from 'd3-geo';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import {
  fitProjectionToBbox,
  getProjectionById
} from '$lib/features/commons/utils/projection.utils';
import {
  buildD3ProjectionFromConfig,
  CLIP_DEGENERACY_LON_EPSILON,
  isClipPolygonProjection
} from '$lib/features/commons/utils/d3-projection-config.utils';

export const COMPOSITE_PROJECTION_PREFIX = 'composite:';

const MERCATOR_ENGINE_SELECTION_IDS = new Set([
  'mercator',
  'equirectangular',
  'albers',
  'lambert-conformal',
  'gall-peters'
]);
type ProjectionOverrideState = Pick<
  ProjectionState,
  | 'selected'
  | 'overrideActive'
  | 'customCode'
  | 'suggestionD3Config'
  | 'suggestionScale'
  | 'center'
  | 'longitude'
  | 'latitude'
  | 'rotation'
>;

interface ResolveUserProjectionOverrideInput {
  state: ProjectionOverrideState;
  fitBbox: BBox | null;
  viewportSize: CanvasSize;
  padding: number;
  projectionPresets: ProjectionPresets | null;
}

function isGeoProjection(
  projection: ProjectionLike
): projection is GeoProjection {
  return (
    typeof (projection as GeoProjection).fitExtent === 'function' &&
    typeof (projection as GeoProjection).center === 'function' &&
    typeof (projection as GeoProjection).rotate === 'function'
  );
}

function getBboxCenter(bbox: BBox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function orientProjectionToState(
  projection: GeoProjection,
  state: ProjectionOverrideState
): void {
  const [longitude, latitude] = state.center ?? [
    state.longitude,
    state.latitude
  ];
  // longitude/latitude are absolute: the projection is centered there. The
  // intrinsic roll (gamma) of the base projection is preserved so oblique
  // suggestions (e.g. Atlantis) keep their orientation; rotation adds an
  // in-plane angle on top.
  const [, , gamma = 0] = projection.rotate();
  const lonEpsilon = isClipPolygonProjection(
    state.suggestionD3Config?.projection
  )
    ? CLIP_DEGENERACY_LON_EPSILON
    : 0;
  projection.rotate([-longitude + lonEpsilon, -latitude, gamma]);
}

function applyUserProjectionTransform(
  projection: GeoProjection,
  state: ProjectionOverrideState
): void {
  orientProjectionToState(projection, state);
  if (state.rotation) {
    projection.angle(projection.angle() + state.rotation);
  }
}

function hasExplicitProjectionOrientation(
  state: ProjectionOverrideState
): boolean {
  return (
    state.center !== undefined || state.longitude !== 0 || state.latitude !== 0
  );
}

function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function isCompositeProjectionCompatibleWithBbox(
  presetId: string,
  fitBbox: BBox | null,
  projectionPresets: ProjectionPresets | null
): boolean {
  if (!fitBbox || !projectionPresets) {
    return true;
  }

  const preset = projectionPresets[presetId];
  if (!preset?.entries?.length) {
    return false;
  }

  return preset.entries.some((entry) =>
    bboxesIntersect(fitBbox, [
      entry.bounds[0][0],
      entry.bounds[0][1],
      entry.bounds[1][0],
      entry.bounds[1][1]
    ])
  );
}

function isUsableGeoProjection(
  projection: GeoProjection,
  fitBbox: BBox
): boolean {
  const [west, south, east, north] = fitBbox;
  const [centerLon, centerLat] = getBboxCenter(fitBbox);
  const samples: [number, number][] = [
    [centerLon, centerLat],
    [west, south],
    [west, north],
    [east, south],
    [east, north],
    [centerLon, south],
    [centerLon, north],
    [west, centerLat],
    [east, centerLat]
  ];

  return samples.some((sample) => {
    const projected = projection(sample);
    return (
      Array.isArray(projected) &&
      projected.length >= 2 &&
      projected.every(Number.isFinite)
    );
  });
}

export function getCompositeProjectionSelectionId(presetId: string): string {
  return `${COMPOSITE_PROJECTION_PREFIX}${presetId}`;
}

export function getCompositeProjectionPresetId(
  selectionId: string
): string | null {
  if (!selectionId.startsWith(COMPOSITE_PROJECTION_PREFIX)) {
    return null;
  }

  const presetId = selectionId.slice(COMPOSITE_PROJECTION_PREFIX.length);
  return presetId.length > 0 ? presetId : null;
}

export function isCompositeProjectionSelectionId(selectionId: string): boolean {
  return getCompositeProjectionPresetId(selectionId) !== null;
}

export function usesMercatorMapProjection(projectionId: string): boolean {
  return (
    MERCATOR_ENGINE_SELECTION_IDS.has(projectionId) ||
    isCompositeProjectionSelectionId(projectionId)
  );
}

export function resolveUserProjectionOverride({
  state,
  fitBbox,
  viewportSize,
  padding,
  projectionPresets
}: ResolveUserProjectionOverrideInput): ProjectionLike | undefined {
  if (!state.overrideActive) {
    return undefined;
  }

  try {
    if (state.customCode) {
      if (!fitBbox) {
        return undefined;
      }

      const projection = proj4d3(state.customCode);
      fitProjectionToBbox(
        projection,
        fitBbox,
        viewportSize.width,
        viewportSize.height,
        padding
      );
      applyUserProjectionTransform(projection, state);
      return isUsableGeoProjection(projection, fitBbox)
        ? projection
        : undefined;
    }

    if (state.suggestionD3Config) {
      if (!fitBbox) {
        return undefined;
      }

      const projection = buildD3ProjectionFromConfig(state.suggestionD3Config);
      if (!projection || !isGeoProjection(projection)) {
        return undefined;
      }

      // World-scale projections (Armadillo, interrupted Mollweide, Waterman,
      // …) must be fit to the whole sphere, not the data bbox, or they
      // collapse/wrap; fitting to a sub-global bbox produces degenerate slivers.
      const isWorldScale =
        state.suggestionScale !== undefined &&
        state.suggestionScale.length > 0 &&
        state.suggestionScale.every((value) => value === 'world');
      if (isWorldScale) {
        projection.fitExtent(
          [
            [padding, padding],
            [viewportSize.width - padding, viewportSize.height - padding]
          ],
          { type: 'Sphere' as const }
        );
      } else {
        fitProjectionToBbox(
          projection,
          fitBbox,
          viewportSize.width,
          viewportSize.height,
          padding
        );
      }
      applyUserProjectionTransform(projection, state);

      return isUsableGeoProjection(projection, fitBbox)
        ? projection
        : undefined;
    }

    const presetId = getCompositeProjectionPresetId(state.selected);
    if (presetId) {
      if (
        !isCompositeProjectionCompatibleWithBbox(
          presetId,
          fitBbox,
          projectionPresets
        )
      ) {
        return undefined;
      }

      return (
        buildCompositeProjectionFromPresetId(
          presetId,
          viewportSize.width,
          viewportSize.height,
          projectionPresets
        ) ?? undefined
      );
    }

    if (!fitBbox) {
      return undefined;
    }

    const projection = getProjectionById(state.selected)?.projection();
    if (!projection || !isGeoProjection(projection)) {
      return undefined;
    }

    fitProjectionToBbox(
      projection,
      fitBbox,
      viewportSize.width,
      viewportSize.height,
      padding
    );
    applyUserProjectionTransform(projection, state);

    if (isUsableGeoProjection(projection, fitBbox)) {
      return projection;
    }

    // The projection's orientation leaves the basemap outside its visible
    // hemisphere — e.g. an azimuthal projection (orthographic, stereographic…)
    // still facing lon 0 while the basemap sits over the Americas. fitExtent
    // only scales/translates, so it then collapses to a degenerate extent.
    // When the user hasn't pinned an orientation, re-center the projection on
    // the basemap and refit so fitExtent measures the visible hemisphere.
    if (hasExplicitProjectionOrientation(state)) {
      return undefined;
    }

    orientProjectionToState(projection, {
      ...state,
      center: getBboxCenter(fitBbox)
    });
    fitProjectionToBbox(
      projection,
      fitBbox,
      viewportSize.width,
      viewportSize.height,
      padding
    );

    return isUsableGeoProjection(projection, fitBbox) ? projection : undefined;
  } catch (error) {
    logger.error(
      'Failed to resolve user projection override',
      LogCategory.MAP,
      {
        selected: state.selected,
        customCode: state.customCode,
        error
      }
    );
    return undefined;
  }
}
