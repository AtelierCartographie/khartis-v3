import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { DatasetResult } from '$lib/features/data-pipeline';
import type { LngLatBoundsLike } from 'maplibre-gl';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { BBox } from '../types';
import type {
  BasemapMetadata,
  ProjectionPresets
} from '../types/basemap.types';
import { calculateBoundsFromGeoArrow } from '../core';
import {
  buildProjectionForBasemap,
  computeProjectedBboxForProjection
} from './geoarrow-stream-bridge.utils';
import { fitBasemapRenderProjection } from './fit-basemap-render-projection.utils';
import { resolveOrthographicBasemapReferenceBboxes } from './orthographic-basemap-reference.utils';
import { resolveProjectionForRender } from './projection-priority.utils';
import { resolveOrthographicReferenceBbox } from './orthographic-reference.utils';
import { shouldUseIdentityProjectionForDatasetCrs } from './dataset-crs.utils';

export type OrthographicBounds = [[number, number], [number, number]];

interface ViewportSize {
  width: number;
  height: number;
}

interface OrthographicProjectionState {
  overrideSource?: 'auto' | 'manual';
}

type OrthographicDatasetRef =
  Pick<DatasetResult, 'geometry'> | null | undefined;

interface ResolveOrthographicRenderProjectionOptions {
  basemapMeta: BasemapMetadata | null;
  projectionState: OrthographicProjectionState;
  viewportSize: ViewportSize;
  projectionPresets: ProjectionPresets | null;
  fitBbox: BBox | null;
  padding: number;
  userOverride?: ProjectionLike;
  allowManualOverride?: boolean;
}

interface ResolveOrthographicReferenceStateOptions {
  dataset: OrthographicDatasetRef;
  bounds: OrthographicBounds | null;
  basemapMeta: BasemapMetadata | null;
  shouldUseBasemapReference: boolean;
  renderProjection: ProjectionLike | null;
  projectionPresets: ProjectionPresets | null;
  viewportSize: ViewportSize;
  preferDatasetBbox?: boolean;
  hasManualProjectionOverride?: boolean;
}

interface ResolveOrthographicBasemapReferenceStateOptions {
  basemapMeta: BasemapMetadata | null;
  basemapTable: ArrowTable | null;
  renderProjection: ProjectionLike | null;
  projectionPresets: ProjectionPresets | null;
  viewportSize: ViewportSize;
}

export interface OrthographicReferenceState {
  bbox: BBox | null;
  isProjected: boolean;
  renderProjection: ProjectionLike | null;
}

export function toOrthographicBounds(
  bounds: LngLatBoundsLike | null
): OrthographicBounds | null {
  if (!bounds) {
    return null;
  }

  if (
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    Array.isArray(bounds[0]) &&
    Array.isArray(bounds[1])
  ) {
    return [
      [bounds[0][0], bounds[0][1]],
      [bounds[1][0], bounds[1][1]]
    ];
  }

  if (Array.isArray(bounds) && bounds.length === 4) {
    return [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]]
    ];
  }

  if (
    typeof bounds === 'object' &&
    bounds !== null &&
    'toArray' in bounds &&
    typeof bounds.toArray === 'function'
  ) {
    const arrayBounds = bounds.toArray();
    return [
      [arrayBounds[0][0], arrayBounds[0][1]],
      [arrayBounds[1][0], arrayBounds[1][1]]
    ];
  }

  return null;
}

export function toBboxFromOrthographicBounds(
  bounds: OrthographicBounds | null
): BBox | null {
  return bounds
    ? [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]
    : null;
}

export function resolveOrthographicRenderProjection({
  basemapMeta,
  projectionState,
  viewportSize,
  projectionPresets,
  fitBbox,
  padding,
  userOverride,
  allowManualOverride = true
}: ResolveOrthographicRenderProjectionOptions): ProjectionLike | undefined {
  const defaultProjection =
    basemapMeta &&
    !basemapMeta.isCustom &&
    basemapMeta.proj_to?.type !== 'identity'
      ? fitBasemapRenderProjection({
          projection: buildProjectionForBasemap(
            basemapMeta,
            viewportSize.width,
            viewportSize.height,
            projectionPresets
          ),
          metadata: basemapMeta,
          fitBbox,
          width: viewportSize.width,
          height: viewportSize.height,
          padding
        })
      : undefined;

  return resolveProjectionForRender(
    defaultProjection,
    userOverride,
    projectionState.overrideSource,
    allowManualOverride
  );
}

export function resolveOrthographicReferenceState({
  dataset,
  bounds,
  basemapMeta,
  shouldUseBasemapReference,
  renderProjection,
  projectionPresets,
  viewportSize,
  preferDatasetBbox = false,
  hasManualProjectionOverride = false
}: ResolveOrthographicReferenceStateOptions): OrthographicReferenceState {
  if (!bounds) {
    return { bbox: null, isProjected: false, renderProjection: null };
  }

  const projectBboxWith = (bbox: BBox | null): BBox | null =>
    renderProjection && bbox
      ? computeProjectedBboxForProjection(renderProjection, bbox)
      : null;
  const shouldUseIdentityReferenceBounds =
    shouldUseIdentityProjectionForDatasetCrs(dataset?.geometry?.crs) &&
    !hasManualProjectionOverride;
  const basemapReference = resolveOrthographicBasemapReferenceBboxes({
    basemapMeta,
    projectionPresets,
    viewportSize,
    projectBbox: projectBboxWith
  });
  const datasetBbox = toBboxFromOrthographicBounds(bounds);
  const datasetProjectedBbox = shouldUseIdentityReferenceBounds
    ? null
    : projectBboxWith(datasetBbox);
  const referenceBbox = resolveOrthographicReferenceBbox({
    datasetBounds: datasetBbox,
    datasetProjectedBbox,
    shouldUseBasemapReference,
    basemapProjectedBbox: basemapReference.projectedBbox,
    basemapMainlandBbox: basemapReference.fallbackBbox,
    preferDatasetBbox
  });
  const isProjected =
    referenceBbox === basemapReference.projectedBbox ||
    referenceBbox === datasetProjectedBbox;

  return {
    bbox: referenceBbox,
    isProjected,
    renderProjection: isProjected ? renderProjection : null
  };
}

export function resolveOrthographicBasemapReferenceState({
  basemapMeta,
  basemapTable,
  renderProjection,
  projectionPresets,
  viewportSize
}: ResolveOrthographicBasemapReferenceStateOptions): OrthographicReferenceState {
  if (!basemapMeta) {
    return { bbox: null, isProjected: false, renderProjection: null };
  }

  const projectBboxWith = (bbox: BBox | null): BBox | null =>
    renderProjection && bbox
      ? computeProjectedBboxForProjection(renderProjection, bbox)
      : null;
  const basemapReference = resolveOrthographicBasemapReferenceBboxes({
    basemapMeta,
    projectionPresets,
    viewportSize,
    projectBbox: projectBboxWith
  });

  if (basemapReference.projectedBbox) {
    return {
      bbox: basemapReference.projectedBbox,
      isProjected: true,
      renderProjection
    };
  }

  if (basemapReference.fallbackBbox) {
    return {
      bbox: basemapReference.fallbackBbox,
      isProjected: false,
      renderProjection: null
    };
  }

  const bounds = basemapTable
    ? calculateBoundsFromGeoArrow(basemapTable)
    : null;
  const tableBbox = toBboxFromOrthographicBounds(toOrthographicBounds(bounds));
  if (tableBbox) {
    return {
      bbox: tableBbox,
      isProjected: false,
      renderProjection: null
    };
  }

  return {
    bbox: basemapMeta.bbox ?? null,
    isProjected: false,
    renderProjection: null
  };
}
