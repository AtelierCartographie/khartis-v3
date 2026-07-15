import { type GeoProjection } from 'd3-geo';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { D3Usage } from '@ateliercartographie/proj-suggest';

import {
  buildProjectionFromCatalogueId,
  fitProjectionToBbox,
  getProjectionD3ConfigById
} from '$lib/features/commons/utils/projection.utils';
import {
  buildD3ProjectionFromConfig,
  CLIP_DEGENERACY_LON_EPSILON,
  isClipPolygonProjection
} from '$lib/features/commons/utils/d3-projection-config.utils';
import { proj4d3 } from './proj4d3.utils';

type BBoxTuple = [number, number, number, number];

// Everything needed to rebuild a user-selected projection, as
// structured-cloneable values only — this crosses the parse-worker boundary
// as the `params` of a projection spec.
export interface UserProjectionBuildParams {
  selected: string;
  customCode?: string;
  suggestionD3Config?: D3Usage;
  suggestionScale?: string[];
  center?: [number, number];
  longitude: number;
  latitude: number;
  rotation: number;
  fitBbox: BBoxTuple;
  width: number;
  height: number;
  padding: number;
}

export function isGeoProjection(
  projection: ProjectionLike
): projection is GeoProjection {
  return (
    typeof (projection as GeoProjection).fitExtent === 'function' &&
    typeof (projection as GeoProjection).center === 'function' &&
    typeof (projection as GeoProjection).rotate === 'function'
  );
}

function getBboxCenter(bbox: BBoxTuple): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function getResolvedD3ProjectionName(
  params: UserProjectionBuildParams
): string | undefined {
  return (
    params.suggestionD3Config?.projection ??
    getProjectionD3ConfigById(params.selected)?.projection
  );
}

function orientProjectionToParams(
  projection: GeoProjection,
  params: UserProjectionBuildParams
): void {
  const [longitude, latitude] = params.center ?? [
    params.longitude,
    params.latitude
  ];
  // longitude/latitude are absolute: the projection is centered there. The
  // intrinsic roll (gamma) of the base projection is preserved so oblique
  // suggestions (e.g. Atlantis) keep their orientation; rotation adds an
  // in-plane angle on top.
  const [, , gamma = 0] = projection.rotate();
  const lonEpsilon = isClipPolygonProjection(
    getResolvedD3ProjectionName(params)
  )
    ? CLIP_DEGENERACY_LON_EPSILON
    : 0;
  projection.rotate([-longitude + lonEpsilon, -latitude, gamma]);
}

function applyUserProjectionTransform(
  projection: GeoProjection,
  params: UserProjectionBuildParams
): void {
  orientProjectionToParams(projection, params);
  if (params.rotation) {
    projection.angle(projection.angle() + params.rotation);
  }
}

function hasExplicitProjectionOrientation(
  params: UserProjectionBuildParams
): boolean {
  return (
    params.center !== undefined ||
    params.longitude !== 0 ||
    params.latitude !== 0
  );
}

export function isUsableGeoProjection(
  projection: GeoProjection,
  fitBbox: BBoxTuple
): boolean {
  const [west, south, east, north] = fitBbox;
  const [centerLon, centerLat] = getBboxCenter(fitBbox);
  const samples: [number, number][] = [
    [centerLon, centerLat],
    [west, south],
    [west, north],
    [east, south],
    [east, north],
    [centerLon, south],
    [centerLon, north],
    [west, centerLat],
    [east, centerLat]
  ];

  return samples.some((sample) => {
    const projected = projection(sample);
    return (
      Array.isArray(projected) &&
      projected.length >= 2 &&
      projected.every(Number.isFinite)
    );
  });
}

// Deterministic rebuild of a non-composite user projection (proj4 custom
// code, ranked suggestion, or catalogue pick) from cloneable params. Runs
// identically on the main thread and inside the parse worker.
export function buildUserProjection(
  params: UserProjectionBuildParams
): GeoProjection | undefined {
  const { fitBbox, width, height, padding } = params;

  if (params.customCode) {
    const projection = proj4d3(params.customCode);
    fitProjectionToBbox(projection, fitBbox, width, height, padding);
    applyUserProjectionTransform(projection, params);
    return isUsableGeoProjection(projection, fitBbox) ? projection : undefined;
  }

  if (params.suggestionD3Config) {
    const projection = buildD3ProjectionFromConfig(params.suggestionD3Config);
    if (!projection || !isGeoProjection(projection)) {
      return undefined;
    }

    // World-scale projections (Armadillo, interrupted Mollweide, Waterman,
    // …) must be fit to the whole sphere, not the data bbox, or they
    // collapse/wrap; fitting to a sub-global bbox produces degenerate slivers.
    const isWorldScale =
      params.suggestionScale !== undefined &&
      params.suggestionScale.length > 0 &&
      params.suggestionScale.every((value) => value === 'world');
    if (isWorldScale) {
      projection.fitExtent(
        [
          [padding, padding],
          [width - padding, height - padding]
        ],
        { type: 'Sphere' as const }
      );
    } else {
      fitProjectionToBbox(projection, fitBbox, width, height, padding);
    }
    applyUserProjectionTransform(projection, params);

    return isUsableGeoProjection(projection, fitBbox) ? projection : undefined;
  }

  const projection = buildProjectionFromCatalogueId(params.selected);
  if (!projection || !isGeoProjection(projection)) {
    return undefined;
  }

  fitProjectionToBbox(projection, fitBbox, width, height, padding);
  applyUserProjectionTransform(projection, params);

  if (isUsableGeoProjection(projection, fitBbox)) {
    return projection;
  }

  // The projection's orientation leaves the basemap outside its visible
  // hemisphere — e.g. an azimuthal projection (orthographic, stereographic…)
  // still facing lon 0 while the basemap sits over the Americas. fitExtent
  // only scales/translates, so it then collapses to a degenerate extent.
  // When the user hasn't pinned an orientation, re-center the projection on
  // the basemap and refit so fitExtent measures the visible hemisphere.
  if (hasExplicitProjectionOrientation(params)) {
    return undefined;
  }

  orientProjectionToParams(projection, {
    ...params,
    center: getBboxCenter(fitBbox)
  });
  fitProjectionToBbox(projection, fitBbox, width, height, padding);

  return isUsableGeoProjection(projection, fitBbox) ? projection : undefined;
}
