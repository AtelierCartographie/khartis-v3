import { type GeoProjection } from 'd3-geo';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import {
  fitProjectionToBbox,
  getProjectionById
} from '$lib/features/commons/utils/projection.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { ProjectionState } from '$lib/features/step-toolbar/tools/projections/projections.types';
import type { BBox, CanvasSize } from '../types';
import type { ProjectionPresets } from '../types/basemap.types';
import { buildCompositeProjectionFromPresetId } from './geoarrow-stream-bridge';
import { proj4d3 } from './proj4d3';

export const COMPOSITE_PROJECTION_PREFIX = 'composite:';

const MERCATOR_ENGINE_SELECTION_IDS = new Set([
  'mercator',
  'equirectangular',
  'albers',
  'lambert-conformal',
  'gall-peters'
]);
const NEUTRAL_TRANSFORM_EPSILON = 1e-9;

type ProjectionOverrideState = Pick<
  ProjectionState,
  | 'selected'
  | 'overrideActive'
  | 'customCode'
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

function hasUserCenterOverride(state: ProjectionOverrideState): boolean {
  const center = state.center ?? [state.longitude, state.latitude];
  return (
    Math.abs(center[0]) > NEUTRAL_TRANSFORM_EPSILON ||
    Math.abs(center[1]) > NEUTRAL_TRANSFORM_EPSILON
  );
}

function hasUserRotationOverride(state: ProjectionOverrideState): boolean {
  return Math.abs(state.rotation) > NEUTRAL_TRANSFORM_EPSILON;
}

function applyUserProjectionTransform(
  projection: GeoProjection,
  state: ProjectionOverrideState
): void {
  if (hasUserCenterOverride(state)) {
    projection.center(state.center ?? [state.longitude, state.latitude]);
  }

  if (hasUserRotationOverride(state)) {
    const [lambda = 0, phi = 0, gamma = 0] = projection.rotate();
    projection.rotate([lambda + state.rotation, phi, gamma]);
  }
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
  const projected = projection(getBboxCenter(fitBbox));
  return (
    Array.isArray(projected) &&
    projected.length >= 2 &&
    projected.every(Number.isFinite)
  );
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
      applyUserProjectionTransform(projection, state);
      fitProjectionToBbox(
        projection,
        fitBbox,
        viewportSize.width,
        viewportSize.height,
        padding
      );
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

    applyUserProjectionTransform(projection, state);
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
