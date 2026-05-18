import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import { PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
import {
  createPathLayerProps,
  parseSphere,
  type BinaryPathData,
  type BinaryPolygonData,
  type ProjectionLike
} from 'geoarrow-deck-stream';
import type { Matrix4 } from '@math.gl/core';
import type { DeckDataRow } from '../types';
import { createCompatibleSolidPolygonLayerProps } from './solid-polygon-layer-props.utils';

export const PROJECTION_SPHERE_MASK_LAYER_ID = 'projection-sphere-mask';
export const PROJECTION_SPHERE_OUTLINE_LAYER_ID = 'projection-sphere-outline';

const PROJECTION_SPHERE_FILL_COLOR: [number, number, number, number] = [
  255, 255, 255, 255
];
const PROJECTION_SPHERE_OUTLINE_COLOR: [number, number, number, number] = [
  90, 90, 90, 200
];
const PROJECTION_SPHERE_OUTLINE_WIDTH = 1;

function isD3StreamProjection(
  projection: ProjectionLike | undefined
): projection is ProjectionLike {
  return typeof projection?.stream === 'function';
}

function hasSpherePolygon(sphereData: BinaryPolygonData): boolean {
  return sphereData.length > 0 && sphereData.positions.length > 0;
}

function hasSpherePath(pathData: BinaryPathData): boolean {
  return pathData.length > 0 && pathData.positions.length > 0;
}

export function createProjectionSphereMaskLayer({
  projection,
  modelMatrix
}: {
  projection: ProjectionLike | undefined;
  modelMatrix: Matrix4 | null | undefined;
}): Layer<DeckDataRow> | null {
  if (!isD3StreamProjection(projection)) {
    return null;
  }

  const sphereData = parseSphere(projection, {
    output: 'polygon'
  }) as BinaryPolygonData;

  if (!hasSpherePolygon(sphereData)) {
    return null;
  }

  return new SolidPolygonLayer({
    id: PROJECTION_SPHERE_MASK_LAYER_ID,
    ...createCompatibleSolidPolygonLayerProps(sphereData),
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getFillColor: PROJECTION_SPHERE_FILL_COLOR,
    pickable: false,
    parameters: {
      depthCompare: 'always' as const
    },
    ...(modelMatrix && { modelMatrix })
  });
}

export function createProjectionSphereOutlineLayer({
  projection,
  modelMatrix
}: {
  projection: ProjectionLike | undefined;
  modelMatrix: Matrix4 | null | undefined;
}): Layer<DeckDataRow> | null {
  if (!isD3StreamProjection(projection)) {
    return null;
  }

  const pathData = parseSphere(projection, {
    output: 'path'
  }) as BinaryPathData;

  if (!hasSpherePath(pathData)) {
    return null;
  }

  return new PathLayer({
    id: PROJECTION_SPHERE_OUTLINE_LAYER_ID,
    ...createPathLayerProps(pathData),
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getColor: PROJECTION_SPHERE_OUTLINE_COLOR,
    getWidth: PROJECTION_SPHERE_OUTLINE_WIDTH,
    widthUnits: 'pixels',
    pickable: false,
    ...(modelMatrix && { modelMatrix })
  });
}

export function applyProjectionSphereMask(
  layers: Layer<DeckDataRow>[],
  maskLayer: Layer<DeckDataRow> | null,
  outlineLayer?: Layer<DeckDataRow> | null
): Layer<DeckDataRow>[] {
  const ordered: Layer<DeckDataRow>[] = [];
  if (maskLayer) ordered.push(maskLayer);
  ordered.push(...layers);
  if (outlineLayer) ordered.push(outlineLayer);
  return ordered;
}
