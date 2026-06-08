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

const DEFAULT_SPHERE_FILL_COLOR: [number, number, number, number] = [
  255, 255, 255, 255
];
const DEFAULT_SPHERE_OUTLINE_COLOR: [number, number, number, number] = [
  90, 90, 90, 200
];
const DEFAULT_SPHERE_OUTLINE_WIDTH = 1;
const SPHERE_BACKGROUND_PARAMETERS = {
  depthCompare: 'always' as const,
  depthWriteEnabled: false
} as const;

function isD3StreamProjection(
  projection: ProjectionLike | undefined
): projection is ProjectionLike {
  return typeof projection?.stream === 'function';
}

function hasSpherePolygon(sphereData: BinaryPolygonData): boolean {
  if (!sphereData || sphereData.length === 0) return false;
  if (!sphereData.positions || sphereData.positions.length === 0) return false;
  const positionsValue = (sphereData.positions as { value?: ArrayBufferView })
    .value;
  if (positionsValue && positionsValue.byteLength === 0) return false;
  return true;
}

function hasSpherePath(pathData: BinaryPathData): boolean {
  if (!pathData || pathData.length === 0) return false;
  if (!pathData.positions || pathData.positions.length === 0) return false;
  const positionsValue = (pathData.positions as { value?: ArrayBufferView })
    .value;
  if (positionsValue && positionsValue.byteLength === 0) return false;
  return true;
}

const spherePolygonCache = new WeakMap<ProjectionLike, BinaryPolygonData>();
const spherePathCache = new WeakMap<ProjectionLike, BinaryPathData>();

function getCachedSpherePolygon(
  projection: ProjectionLike
): BinaryPolygonData | null {
  const cached = spherePolygonCache.get(projection);
  if (cached) return hasSpherePolygon(cached) ? cached : null;
  try {
    const sphereData = parseSphere(projection, {
      output: 'polygon'
    }) as BinaryPolygonData;
    if (!hasSpherePolygon(sphereData)) return null;
    spherePolygonCache.set(projection, sphereData);
    return sphereData;
  } catch {
    return null;
  }
}

function getCachedSpherePath(
  projection: ProjectionLike
): BinaryPathData | null {
  const cached = spherePathCache.get(projection);
  if (cached) return hasSpherePath(cached) ? cached : null;
  try {
    const pathData = parseSphere(projection, {
      output: 'path'
    }) as BinaryPathData;
    if (!hasSpherePath(pathData)) return null;
    spherePathCache.set(projection, pathData);
    return pathData;
  } catch {
    return null;
  }
}

export interface SphereMaskOptions {
  projection: ProjectionLike | undefined;
  modelMatrix: Matrix4 | null | undefined;
  fillColor?: [number, number, number, number];
}

export function createProjectionSphereMaskLayer({
  projection,
  modelMatrix,
  fillColor = DEFAULT_SPHERE_FILL_COLOR
}: SphereMaskOptions): Layer<DeckDataRow> | null {
  if (!isD3StreamProjection(projection)) {
    return null;
  }

  const sphereData = getCachedSpherePolygon(projection);
  if (!sphereData) return null;

  try {
    return new SolidPolygonLayer({
      id: PROJECTION_SPHERE_MASK_LAYER_ID,
      ...createCompatibleSolidPolygonLayerProps(sphereData),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getFillColor: fillColor,
      pickable: false,
      parameters: SPHERE_BACKGROUND_PARAMETERS,
      updateTriggers: {
        getFillColor: [fillColor[0], fillColor[1], fillColor[2], fillColor[3]]
      },
      ...(modelMatrix && { modelMatrix })
    });
  } catch {
    return null;
  }
}

export interface SphereOutlineOptions {
  projection: ProjectionLike | undefined;
  modelMatrix: Matrix4 | null | undefined;
  color?: [number, number, number, number];
  width?: number;
}

export function createProjectionSphereOutlineLayer({
  projection,
  modelMatrix,
  color = DEFAULT_SPHERE_OUTLINE_COLOR,
  width = DEFAULT_SPHERE_OUTLINE_WIDTH
}: SphereOutlineOptions): Layer<DeckDataRow> | null {
  if (!isD3StreamProjection(projection)) {
    return null;
  }

  const pathData = getCachedSpherePath(projection);
  if (!pathData) return null;

  try {
    return new PathLayer({
      id: PROJECTION_SPHERE_OUTLINE_LAYER_ID,
      ...createPathLayerProps(pathData),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getColor: color,
      getWidth: width,
      widthUnits: 'pixels',
      pickable: false,
      updateTriggers: {
        getColor: [color[0], color[1], color[2], color[3]],
        getWidth: [width]
      },
      ...(modelMatrix && { modelMatrix })
    });
  } catch {
    return null;
  }
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
