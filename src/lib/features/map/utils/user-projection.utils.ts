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
      const center = state.center ?? [state.longitude, state.latitude];
      projection.center(center);
      projection.rotate([state.rotation, 0, 0]);
      fitProjectionToBbox(
        projection,
        fitBbox,
        viewportSize.width,
        viewportSize.height,
        padding
      );
      return projection;
    }

    const presetId = getCompositeProjectionPresetId(state.selected);
    if (presetId) {
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

    const center = state.center ?? [state.longitude, state.latitude];
    projection.center(center);
    projection.rotate([state.rotation, 0, 0]);
    fitProjectionToBbox(
      projection,
      fitBbox,
      viewportSize.width,
      viewportSize.height,
      padding
    );

    return projection;
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
