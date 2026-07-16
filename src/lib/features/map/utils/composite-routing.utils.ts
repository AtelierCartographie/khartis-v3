import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import { type GeoStream } from 'd3-geo';

export type GeoBounds = [number, number, number, number];

export type CompositeSubProjection = {
  id: string;
  projection: ProjectionLike;
  bounds: GeoBounds;
  screenExtent: [[number, number], [number, number]];
};

export type CompositeProjectionLike = ProjectionLike & {
  getSubProjections: () => CompositeSubProjection[];
  getInsetBorders?: () => unknown;
  invert?: (coordinates: [number, number]) => [number, number] | null;
};

export function isWithinBounds(
  lon: number,
  lat: number,
  bounds: GeoBounds
): boolean {
  return (
    lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]
  );
}

// Routing margin around each sub-projection's geographic bounds. The visible
// cut must come from the sub-projection's rectangular screen clipExtent (the
// cell frame), not from this geographic box: a lon/lat cut projects as curved
// parallels / oblique meridians (the curved Maghreb edge and the diagonal cut
// through Russia on the Europe composite). The margin pushes the geographic
// cut far enough outside the cell that only the screen rectangle shows, while
// still bounding how much far-away geometry is fed to proj4.
const ROUTING_BOUNDS_MARGIN_RATIO = 0.5;

function expandBoundsForRouting(bounds: GeoBounds): GeoBounds {
  const lonMargin = (bounds[2] - bounds[0]) * ROUTING_BOUNDS_MARGIN_RATIO;
  const latMargin = (bounds[3] - bounds[1]) * ROUTING_BOUNDS_MARGIN_RATIO;
  return [
    bounds[0] - lonMargin,
    Math.max(-90, bounds[1] - latMargin),
    bounds[2] + lonMargin,
    Math.min(90, bounds[3] + latMargin)
  ];
}

// Splits an open line string into contiguous in-bounds runs. Dropping
// out-of-bounds points and keeping a single run would reconnect the surviving
// points straight across the gap when a line exits and re-enters the box.
function splitLineToBounds(
  line: readonly [number, number][],
  bounds: GeoBounds
): [number, number][][] {
  const runs: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const point of line) {
    if (isWithinBounds(point[0], point[1], bounds)) {
      current.push(point);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    runs.push(current);
  }
  return runs;
}

// Sutherland-Hodgman clip of a polygon ring against an axis-aligned lon/lat
// rectangle (bounds = [west, south, east, north]). Routing a composite ring to
// a sub-projection by merely *dropping* out-of-bounds points reconnects the
// surviving points straight across the gap, producing a degenerate fan/triangle
// (the grey wedge that swallowed the sea and the UK on the NUTS basemap). Real
// clipping inserts the boundary-intersection vertices so the ring follows the
// rectangle edge instead of cutting across it.
function clipRingToBounds(
  ring: readonly [number, number][],
  bounds: GeoBounds
): [number, number][] {
  if (ring.length < 3) {
    return [];
  }
  const [west, south, east, north] = bounds;

  type Edge = {
    inside: (p: [number, number]) => boolean;
    intersect: (a: [number, number], b: [number, number]) => [number, number];
  };
  const edges: Edge[] = [
    {
      inside: (p) => p[0] >= west,
      intersect: (a, b) => {
        const t = (west - a[0]) / (b[0] - a[0]);
        return [west, a[1] + t * (b[1] - a[1])];
      }
    },
    {
      inside: (p) => p[0] <= east,
      intersect: (a, b) => {
        const t = (east - a[0]) / (b[0] - a[0]);
        return [east, a[1] + t * (b[1] - a[1])];
      }
    },
    {
      inside: (p) => p[1] >= south,
      intersect: (a, b) => {
        const t = (south - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), south];
      }
    },
    {
      inside: (p) => p[1] <= north,
      intersect: (a, b) => {
        const t = (north - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), north];
      }
    }
  ];

  let output: [number, number][] = [...ring];
  for (const edge of edges) {
    if (output.length === 0) {
      return [];
    }
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentInside = edge.inside(current);
      const previousInside = edge.inside(previous);
      if (currentInside) {
        if (!previousInside) {
          output.push(edge.intersect(previous, current));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(edge.intersect(previous, current));
      }
    }
  }
  return output.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function hasCompositeSubProjections(
  projection: ProjectionLike
): projection is CompositeProjectionLike {
  return (
    typeof (projection as { getSubProjections?: unknown }).getSubProjections ===
    'function'
  );
}

export function withGeographicBoundsRouting(
  projection: CompositeProjectionLike
): CompositeProjectionLike {
  let cachedSink: GeoStream | null = null;
  let cachedStream: GeoStream | null = null;

  const routed = ((coordinates: [number, number]) =>
    projection(coordinates)) as CompositeProjectionLike;

  routed.stream = (sink: GeoStream): GeoStream => {
    if (cachedSink === sink && cachedStream) {
      return cachedStream;
    }

    const entries = projection.getSubProjections();
    const streams = entries.map((entry) => entry.projection.stream(sink));
    const routingBounds = entries.map((entry) =>
      expandBoundsForRouting(entry.bounds)
    );

    // Collect the FULL ring, then route to each sub-projection whose expanded
    // bounds it touches. The geographic clip (Sutherland-Hodgman for rings,
    // run-splitting for lines) happens on the expanded box, so the visible cut
    // is always the sub-projection's rectangular screen clipExtent — the cell
    // frame — never a curved parallel or oblique meridian.
    let ringBuffer: [number, number][] | null = null;
    let inPolygon = false;

    const emitRing = (index: number, points: [number, number][]): void => {
      if (points.length < 2) return;
      streams[index].lineStart();
      for (const [lon, lat] of points) {
        streams[index].point(lon, lat);
      }
      streams[index].lineEnd();
    };

    cachedStream = {
      point(lon: number, lat: number): void {
        if (ringBuffer) {
          ringBuffer.push([lon, lat]);
        } else {
          for (let index = 0; index < entries.length; index++) {
            if (isWithinBounds(lon, lat, routingBounds[index])) {
              streams[index].point(lon, lat);
            }
          }
        }
      },
      sphere(): void {
        for (const stream of streams) {
          stream.sphere?.();
        }
      },
      lineStart(): void {
        ringBuffer = [];
      },
      lineEnd(): void {
        if (!ringBuffer) return;
        const ring = ringBuffer;
        ringBuffer = null;
        for (let index = 0; index < streams.length; index++) {
          const bounds = routingBounds[index];
          // Only route the ring to a sub-projection it actually touches. A ring
          // that merely *encloses* a distant inset's bounds (e.g. the mainland
          // outline around a DOM-TOM box) has no vertex inside it; clipping such
          // a ring would emit the bounds rectangle as a spurious filled box (the
          // grey square that appeared next to Spain). Requiring a vertex inside
          // keeps real coastlines while dropping the enclosing-only case.
          if (!ring.some(([lon, lat]) => isWithinBounds(lon, lat, bounds))) {
            continue;
          }
          if (inPolygon) {
            emitRing(index, clipRingToBounds(ring, bounds));
          } else {
            for (const run of splitLineToBounds(ring, bounds)) {
              emitRing(index, run);
            }
          }
        }
      },
      polygonStart(): void {
        inPolygon = true;
        for (const stream of streams) {
          stream.polygonStart();
        }
      },
      polygonEnd(): void {
        inPolygon = false;
        for (const stream of streams) {
          stream.polygonEnd();
        }
      }
    };
    cachedSink = sink;
    return cachedStream;
  };

  routed.getSubProjections = () => projection.getSubProjections();

  if (projection.getInsetBorders) {
    routed.getInsetBorders = () => projection.getInsetBorders?.() ?? [];
  }

  if (projection.invert) {
    routed.invert = (coordinates: [number, number]) =>
      projection.invert?.(coordinates) ?? null;
  }

  return routed;
}
