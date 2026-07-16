import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { ProjectionState } from '$lib/features/step-toolbar/tools/projections';
import type { BBox, CanvasSize } from '../types';
import type { ProjectionPresets } from '../types/basemap.types';
import {
  buildCompositeProjectionFromPresetId,
  registerProjectionSpec
} from './geoarrow-stream-bridge.utils';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import {
  buildUserProjection,
  type UserProjectionBuildParams
} from './user-projection-build.utils';
import { KHARTIS_USER_PROJECTION_FACTORY } from './khartis-projection-factories.utils';
import { isCompositeProjectionPresetCompatibleWithBbox } from './composite-projection-compatibility.utils';

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
    const presetId = getCompositeProjectionPresetId(state.selected);
    if (presetId) {
      if (
        !isCompositeProjectionPresetCompatibleWithBbox(
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

    const params: UserProjectionBuildParams = {
      selected: state.selected,
      customCode: state.customCode || undefined,
      suggestionD3Config: state.suggestionD3Config ?? undefined,
      suggestionScale: state.suggestionScale ?? undefined,
      center: state.center ?? undefined,
      longitude: state.longitude,
      latitude: state.latitude,
      rotation: state.rotation,
      fitBbox,
      width: viewportSize.width,
      height: viewportSize.height,
      padding
    };

    const projection = buildUserProjection(params);
    if (!projection) {
      return undefined;
    }

    return registerProjectionSpec(projection, {
      projection: KHARTIS_USER_PROJECTION_FACTORY,
      params
    });
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
