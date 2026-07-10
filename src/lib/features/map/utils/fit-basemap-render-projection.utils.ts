import type { GeoProjection } from 'd3-geo';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import { fitProjectionToBbox } from '$lib/features/commons/utils/projection.utils';
import type { BBox } from '../types';
import type { BasemapMetadata } from '../types/basemap.types';

interface FitBasemapRenderProjectionOptions {
  projection: ProjectionLike;
  metadata: BasemapMetadata | null | undefined;
  fitBbox: BBox | null;
  width: number;
  height: number;
  padding: number;
}

function isFittableProjection(
  projection: ProjectionLike
): projection is GeoProjection {
  return typeof (projection as GeoProjection).fitExtent === 'function';
}

export function fitBasemapRenderProjection({
  projection,
  metadata,
  fitBbox,
  width,
  height,
  padding
}: FitBasemapRenderProjectionOptions): ProjectionLike {
  if (
    metadata?.proj_to?.type !== 'simple' ||
    !fitBbox ||
    !isFittableProjection(projection)
  ) {
    return projection;
  }

  fitProjectionToBbox(projection, fitBbox, width, height, padding);
  return projection;
}
