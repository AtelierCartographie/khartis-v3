import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';

type BBoxTuple = [number, number, number, number];

export function createProjectionPointSampler(
  projection: ProjectionLike
): (coordinates: [number, number]) => [number, number] | null {
  let projected: [number, number] | null = null;
  const stream = projection.stream({
    point(x: number, y: number): void {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        projected = [x, y];
      }
    },
    lineStart(): void {},
    lineEnd(): void {},
    polygonStart(): void {},
    polygonEnd(): void {}
  });

  return (coordinates: [number, number]) => {
    projected = null;
    stream.point(coordinates[0], coordinates[1]);
    return projected;
  };
}

export function sampleProjectedBbox(
  projection: ProjectionLike,
  bbox: BBoxTuple
): BBoxTuple | null {
  const [west, south, east, north] = bbox;
  const steps = 32;
  const interiorSteps = 8;
  const xs: number[] = [];
  const ys: number[] = [];
  const projectPoint = createProjectionPointSampler(projection);

  const tryProject = (lon: number, lat: number) => {
    const result = projectPoint([lon, lat]);
    if (result && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
      xs.push(result[0]);
      ys.push(result[1]);
    }
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lon = west + t * (east - west);
    const lat = south + t * (north - south);
    tryProject(lon, south);
    tryProject(lon, north);
    tryProject(west, lat);
    tryProject(east, lat);
  }
  tryProject((west + east) / 2, (south + north) / 2);

  for (let xStep = 1; xStep < interiorSteps; xStep++) {
    const lon = west + (xStep / interiorSteps) * (east - west);
    for (let yStep = 1; yStep < interiorSteps; yStep++) {
      const lat = south + (yStep / interiorSteps) * (north - south);
      tryProject(lon, lat);
    }
  }

  return xs.length === 0
    ? null
    : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
