import type { Layer, PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';

import {
  SELECTED_POINT_RING_RADIUS,
  SELECTED_POLYGON_STROKE_COLOR,
  SELECTED_POLYGON_STROKE_WIDTH
} from './layer-selection-overlays';

const HOVER_HIGHLIGHT_SUFFIX = 'hover-highlight';
const POINT_RING_GAP_PX = 2;

const HIGHLIGHT_PARAMETERS = {
  depthCompare: 'always' as const,
  stencilCompare: 'always' as const
};

type PolygonGeometry = {
  positions: Float32Array;
  polygonIndices: Uint32Array;
  holeIndices: Uint32Array;
  featureIds: Uint32Array;
};

type PathGeometry = {
  length: number;
  positions: Float32Array;
  startIndices: Uint32Array;
  featureIds: Uint32Array;
};

type PointGeometry = {
  length: number;
  positions: Float32Array;
  featureIds: Uint32Array;
};

export interface HoveredFeature {
  sourceLayerId: string;
  featureId: number;
}

function hasTypedArray(value: object, key: string): boolean {
  return ArrayBuffer.isView(Reflect.get(value, key));
}

function isPolygonGeometry(value: object): value is PolygonGeometry {
  return (
    hasTypedArray(value, 'polygonIndices') &&
    hasTypedArray(value, 'holeIndices') &&
    hasTypedArray(value, 'featureIds')
  );
}

function isPathGeometry(value: object): value is PathGeometry {
  return (
    hasTypedArray(value, 'startIndices') && hasTypedArray(value, 'featureIds')
  );
}

function isPointGeometry(value: object): value is PointGeometry {
  return (
    hasTypedArray(value, 'positions') && hasTypedArray(value, 'featureIds')
  );
}

function resolvePickGeometry(info: PickingInfo): object | null {
  const data = info.layer?.props?.data;
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const geometry = Reflect.get(data, 'khartisPickGeometry');
  return typeof geometry === 'object' && geometry !== null ? geometry : null;
}

export function resolveHoveredFeature(
  info: PickingInfo
): HoveredFeature | null {
  const layerId = info.layer?.id;
  const geometry = resolvePickGeometry(info);
  if (!layerId || !geometry || info.index === undefined || info.index < 0) {
    return null;
  }
  const featureIds = Reflect.get(geometry, 'featureIds') as ArrayLike<number>;
  const featureId = featureIds[info.index];
  return featureId === undefined
    ? null
    : { sourceLayerId: layerId, featureId: Number(featureId) };
}

type RingPath = Float32Array;

// Every part of a multi-part feature shares its feature id, so the outline
// covers all of them, holes included.
function collectPolygonRings(
  geometry: PolygonGeometry,
  featureId: number
): RingPath[] {
  const rings: RingPath[] = [];
  const { polygonIndices, holeIndices, positions, featureIds } = geometry;
  let ringIndex = 0;

  for (let polygon = 0; polygon < polygonIndices.length - 1; polygon++) {
    const polygonStart = polygonIndices[polygon];
    const polygonEnd = polygonIndices[polygon + 1];
    while (
      ringIndex < holeIndices.length - 1 &&
      holeIndices[ringIndex] < polygonStart
    ) {
      ringIndex++;
    }
    if (featureIds[polygon] !== featureId) {
      continue;
    }
    for (
      let ring = ringIndex;
      ring < holeIndices.length - 1 && holeIndices[ring] < polygonEnd;
      ring++
    ) {
      const ringEnd = Math.min(holeIndices[ring + 1], polygonEnd);
      rings.push(positions.subarray(holeIndices[ring] * 2, ringEnd * 2));
    }
  }

  return rings;
}

function collectPaths(geometry: PathGeometry, featureId: number): RingPath[] {
  const paths: RingPath[] = [];
  const { startIndices, positions, featureIds, length } = geometry;
  for (let path = 0; path < length; path++) {
    if (featureIds[path] !== featureId) {
      continue;
    }
    const end = path + 1 < startIndices.length ? startIndices[path + 1] : -1;
    paths.push(
      positions.subarray(
        startIndices[path] * 2,
        end < 0 ? positions.length : end * 2
      )
    );
  }
  return paths;
}

function collectPoints(
  geometry: PointGeometry,
  featureId: number
): Float32Array {
  const coordinates: number[] = [];
  for (let point = 0; point < geometry.length; point++) {
    if (geometry.featureIds[point] === featureId) {
      coordinates.push(
        geometry.positions[point * 2],
        geometry.positions[point * 2 + 1]
      );
    }
  }
  return new Float32Array(coordinates);
}

// The ring hugs the hovered symbol: its pixel radius is the layer's own
// radius accessor times its radius scale.
function resolvePickedRadiusPx(info: PickingInfo): number {
  const props = (info.layer?.props ?? {}) as Record<string, unknown>;
  const radiusScale =
    typeof props.radiusScale === 'number' ? props.radiusScale : 1;
  const data = props.data as
    { attributes?: { getRadius?: { value?: ArrayLike<number> } } } | undefined;
  const binaryRadius = data?.attributes?.getRadius?.value?.[info.index];
  const radius =
    typeof binaryRadius === 'number'
      ? binaryRadius
      : typeof props.getRadius === 'number'
        ? props.getRadius
        : 0;
  return Math.max(
    SELECTED_POINT_RING_RADIUS,
    radius * radiusScale + POINT_RING_GAP_PX
  );
}

function pickPlacementProps(info: PickingInfo): Record<string, unknown> {
  const props = (info.layer?.props ?? {}) as Record<string, unknown>;
  const placement: Record<string, unknown> = {};
  for (const key of [
    'modelMatrix',
    'coordinateSystem',
    'coordinateOrigin',
    'beforeId'
  ]) {
    if (props[key] !== undefined && props[key] !== null) {
      placement[key] = props[key];
    }
  }
  return placement;
}

function buildPathOverlay(
  id: string,
  paths: RingPath[],
  placement: Record<string, unknown>
): Layer {
  return new PathLayer<RingPath>({
    id,
    data: paths,
    getPath: (path) => path as unknown as [number, number][],
    positionFormat: 'XY',
    _pathType: 'open',
    getColor: SELECTED_POLYGON_STROKE_COLOR,
    getWidth: SELECTED_POLYGON_STROKE_WIDTH,
    widthUnits: 'pixels',
    jointRounded: true,
    capRounded: true,
    pickable: false,
    parameters: HIGHLIGHT_PARAMETERS,
    ...placement
  });
}

export function createHoverHighlightOverlay(info: PickingInfo): Layer | null {
  const hovered = resolveHoveredFeature(info);
  const geometry = resolvePickGeometry(info);
  if (!hovered || !geometry) {
    return null;
  }

  const id = `${hovered.sourceLayerId}-${HOVER_HIGHLIGHT_SUFFIX}`;
  const placement = pickPlacementProps(info);

  if (isPolygonGeometry(geometry)) {
    const rings = collectPolygonRings(geometry, hovered.featureId);
    return rings.length > 0 ? buildPathOverlay(id, rings, placement) : null;
  }

  if (isPathGeometry(geometry)) {
    const paths = collectPaths(geometry, hovered.featureId);
    return paths.length > 0 ? buildPathOverlay(id, paths, placement) : null;
  }

  if (isPointGeometry(geometry)) {
    const positions = collectPoints(geometry, hovered.featureId);
    if (positions.length === 0) {
      return null;
    }
    return new ScatterplotLayer({
      id,
      data: {
        length: positions.length / 2,
        attributes: { getPosition: { value: positions, size: 2 } }
      },
      filled: false,
      stroked: true,
      radiusUnits: 'pixels',
      getRadius: resolvePickedRadiusPx(info),
      lineWidthUnits: 'pixels',
      getLineWidth: SELECTED_POLYGON_STROKE_WIDTH,
      getLineColor: SELECTED_POLYGON_STROKE_COLOR,
      pickable: false,
      parameters: HIGHLIGHT_PARAMETERS,
      ...placement
    }) as unknown as Layer;
  }

  return null;
}
