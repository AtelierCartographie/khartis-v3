import type { GeoProjection } from 'd3-geo';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { BBox } from '../types';
import { sampleProjectedBbox } from './projected-bbox.utils';
import { shouldUseIdentityProjectionForDatasetCrs } from './dataset-crs.utils';

export type BasemapFrameExtent = [[number, number], [number, number]];

const BASEMAP_FRAME_MARGIN_RATIO = 0.1;
const WORLD_LONGITUDE_SPAN = 300;
const WORLD_LATITUDE_SPAN = 120;

type ProjectionWithClipExtent = ProjectionLike & {
  clipExtent(): BasemapFrameExtent | null;
};

function hasClipExtent(
  projection: ProjectionLike
): projection is ProjectionWithClipExtent {
  return (
    typeof (projection as { clipExtent?: unknown }).clipExtent === 'function'
  );
}

export function expandToBasemapFrame([
  minX,
  minY,
  maxX,
  maxY
]: BBox): BasemapFrameExtent {
  const marginX = (maxX - minX) * BASEMAP_FRAME_MARGIN_RATIO;
  const marginY = (maxY - minY) * BASEMAP_FRAME_MARGIN_RATIO;
  return [
    [minX - marginX, minY - marginY],
    [maxX + marginX, maxY + marginY]
  ];
}

export function withBasemapFrameMargin(bbox: BBox): BBox {
  const [[minX, minY], [maxX, maxY]] = expandToBasemapFrame(bbox);
  return [minX, minY, maxX, maxY];
}

export function getBasemapFrameExtent(
  projection: ProjectionLike | null | undefined
): BasemapFrameExtent | null {
  return projection && hasClipExtent(projection)
    ? projection.clipExtent()
    : null;
}

export function getBasemapFrameBbox(
  projection: ProjectionLike | null | undefined
): BBox | null {
  const frame = getBasemapFrameExtent(projection);
  return frame ? [frame[0][0], frame[0][1], frame[1][0], frame[1][1]] : null;
}

export function isFramedExtent([west, south, east, north]: BBox): boolean {
  return (
    east - west < WORLD_LONGITUDE_SPAN || north - south < WORLD_LATITUDE_SPAN
  );
}

export function applyBasemapFrame(
  projection: GeoProjection,
  bbox: BBox
): BasemapFrameExtent | null {
  const projectedBbox = sampleProjectedBbox(projection, bbox);
  if (!projectedBbox) {
    return null;
  }
  const frame = expandToBasemapFrame(projectedBbox);
  projection.clipExtent(frame);
  return frame;
}

export function resolveUnprojectedFrameBbox(
  bbox: BBox,
  crs: string | null | undefined
): BBox | null {
  return shouldUseIdentityProjectionForDatasetCrs(crs) || isFramedExtent(bbox)
    ? withBasemapFrameMargin(bbox)
    : null;
}
