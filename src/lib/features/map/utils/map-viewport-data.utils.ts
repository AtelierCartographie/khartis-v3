import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { projectionStore } from '../stores/projection.store.svelte';

/**
 * Data behind a pixel of the map viewport, read through the chain the layers
 * are actually drawn with: deck viewport, the layers' model matrix, then the
 * render projection. `space` says what the coordinates are: lon/lat through
 * the render projection, or the raw data coordinates when nothing projects
 * them (lon/lat, or the source CRS of a dataset drawn as is).
 */
export interface MapViewportDataReader {
  space: 'lonlat' | 'data';
  read: (x: number, y: number) => [number, number] | null;
}

type Matrix = ArrayLike<number>;

type DeckLike = {
  props?: { layers?: unknown };
  getViewports?: () => Array<{
    project: (point: number[]) => number[];
    unproject: (point: number[]) => number[];
  }>;
};

// Outside the projected world outline (corners around an Equal Earth or a
// Natural Earth) `invert` aliases the longitude instead of failing: only
// points that project back where they came from are data.
const ROUND_TRIP_EPSILON_PX = 0.5;

type InvertibleProjection = ((point: [number, number]) => unknown) & {
  invert?: (point: [number, number]) => [number, number] | null | undefined;
};

function finitePoint(point: unknown): [number, number] | null {
  return Array.isArray(point) &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
    ? [point[0], point[1]]
    : null;
}

function findLayerModelMatrix(deck: DeckLike): Matrix | null {
  const layers = [deck.props?.layers].flat(Infinity) as Array<{
    props?: { modelMatrix?: unknown };
  } | null>;
  for (const layer of layers) {
    const matrix = layer?.props?.modelMatrix;
    if (matrix && typeof (matrix as Matrix).length === 'number') {
      return matrix as Matrix;
    }
  }
  return null;
}

function applyModelMatrix(
  matrix: Matrix | null
): (projected: [number, number]) => [number, number] {
  if (!matrix) {
    return (projected) => projected;
  }
  return ([x, y]) => [
    matrix[0] * x + matrix[4] * y + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[13]
  ];
}

// The layers' model matrix is a 2D affine map (scale, flip, translation)
// from projected coordinates to deck world coordinates.
function invertModelMatrix(
  matrix: Matrix | null
): (world: [number, number]) => [number, number] | null {
  if (!matrix) {
    return (world) => world;
  }
  const [a, b, c, d, tx, ty] = [
    matrix[0],
    matrix[1],
    matrix[4],
    matrix[5],
    matrix[12],
    matrix[13]
  ];
  const det = a * d - b * c;
  if (!Number.isFinite(det) || det === 0) {
    return () => null;
  }
  return ([x, y]) => {
    const dx = x - tx;
    const dy = y - ty;
    return [(d * dx - c * dy) / det, (a * dy - b * dx) / det];
  };
}

function createMapLibreReader(): MapViewportDataReader | null {
  const map = mapInstanceStore.map as {
    unproject?: (point: [number, number]) => { lng: number; lat: number };
  } | null;
  if (!map || !mapInstanceStore.isMapLoaded || !map.unproject) {
    return null;
  }
  const unproject = map.unproject.bind(map);
  return {
    space: 'lonlat',
    read: (x, y) => {
      const lngLat = unproject([x, y]);
      return finitePoint([lngLat?.lng, lngLat?.lat]);
    }
  };
}

export function createMapViewportDataReader(): MapViewportDataReader | null {
  const mapLibre = createMapLibreReader();
  if (mapLibre) {
    return mapLibre;
  }

  const deck = mapInstanceStore.deckInstance as DeckLike | null;
  const viewport = deck?.getViewports?.()[0];
  if (!deck || !viewport) {
    return null;
  }
  const modelMatrix = findLayerModelMatrix(deck);
  const toProjected = invertModelMatrix(modelMatrix);
  const toWorld = applyModelMatrix(modelMatrix);
  const projection =
    projectionStore.renderProjection as InvertibleProjection | null;

  const readProjected = (x: number, y: number) => {
    const world = finitePoint(viewport.unproject([x, y]));
    return world ? toProjected(world) : null;
  };

  if (projection) {
    if (typeof projection.invert !== 'function') {
      return null;
    }
    const invert = projection.invert.bind(projection);
    return {
      space: 'lonlat',
      read: (x, y) => {
        const projected = readProjected(x, y);
        const lonLat = projected ? finitePoint(invert(projected)) : null;
        const back = lonLat ? finitePoint(projection(lonLat)) : null;
        const pixel = back
          ? finitePoint(viewport.project(toWorld(back)))
          : null;
        return pixel &&
          Math.hypot(pixel[0] - x, pixel[1] - y) <= ROUND_TRIP_EPSILON_PX
          ? lonLat
          : null;
      }
    };
  }

  return { space: 'data', read: readProjected };
}
