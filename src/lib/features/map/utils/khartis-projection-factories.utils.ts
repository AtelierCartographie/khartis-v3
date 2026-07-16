import {
  buildCompositeProjection,
  type ProjectionLike
} from '@ateliercartographie/geoarrow-deck-stream';
import type { ProjectionRegistry } from '@ateliercartographie/geoarrow-deck-stream/worker';
import type { GeoProjection } from 'd3-geo';
import * as _d3GeoProjection from 'd3-geo-projection';

import { proj4d3 } from './proj4d3.utils';
import { fitProjectionToBbox } from '$lib/features/commons/utils/projection.utils';
import {
  buildUserProjection,
  type UserProjectionBuildParams
} from './user-projection-build.utils';
import {
  hasCompositeSubProjections,
  withGeographicBoundsRouting,
  type GeoBounds
} from './composite-routing.utils';

const { geoNaturalEarth2 } = _d3GeoProjection as unknown as {
  geoNaturalEarth2: () => GeoProjection;
};

const D3_GEO_PROJECTION_MAP: Record<string, () => GeoProjection> = {
  natearth2: geoNaturalEarth2
};

export function resolveSimpleProjection(proj4String: string): GeoProjection {
  const match = proj4String.match(/\+proj=([^\s+]+)/);
  if (match) {
    const factory = D3_GEO_PROJECTION_MAP[match[1]];
    if (factory) return factory();
  }
  return proj4d3(proj4String);
}

export interface KhartisProj4Params {
  proj4: string;
  // Screen fit applied after construction (mirrors fitBasemapRenderProjection);
  // it must travel with the spec or the worker rebuilds an unfitted projection.
  fit?: {
    bbox: [number, number, number, number];
    width: number;
    height: number;
    padding: number;
  };
}

export function buildKhartisProj4Projection(
  params: KhartisProj4Params
): GeoProjection {
  const projection = resolveSimpleProjection(params.proj4);
  if (params.fit) {
    fitProjectionToBbox(
      projection,
      params.fit.bbox,
      params.fit.width,
      params.fit.height,
      params.fit.padding
    );
  }
  return projection;
}

export const KHARTIS_PROJ4_FACTORY = 'khartisProj4';
export const KHARTIS_COMPOSITE_FACTORY = 'khartisComposite';
export const KHARTIS_USER_PROJECTION_FACTORY = 'khartisUserProjection';

export interface KhartisCompositeEntryParams {
  id: string;
  proj4: string;
  bounds: GeoBounds;
  layout: { x: number; y: number; width: number; height: number };
  scaleMultiplier?: number;
}

export interface KhartisCompositeParams {
  width: number;
  height: number;
  entries: KhartisCompositeEntryParams[];
}

export function buildKhartisCompositeProjection(
  params: KhartisCompositeParams
): ProjectionLike {
  const projection = buildCompositeProjection({
    width: params.width,
    height: params.height,
    entries: params.entries.map((entry) => ({
      id: entry.id,
      projection: resolveSimpleProjection(entry.proj4),
      bounds: entry.bounds,
      layout: entry.layout,
      scaleMultiplier: entry.scaleMultiplier
    }))
  });

  return hasCompositeSubProjections(projection)
    ? withGeographicBoundsRouting(projection)
    : projection;
}

export const khartisProjectionFactories: ProjectionRegistry = {
  [KHARTIS_PROJ4_FACTORY]: (params) =>
    buildKhartisProj4Projection(params as KhartisProj4Params),
  [KHARTIS_COMPOSITE_FACTORY]: (params) =>
    buildKhartisCompositeProjection(params as KhartisCompositeParams),
  [KHARTIS_USER_PROJECTION_FACTORY]: (params) => {
    const projection = buildUserProjection(params as UserProjectionBuildParams);
    if (!projection) {
      throw new Error(
        'User projection params did not yield a usable projection'
      );
    }
    return projection;
  }
};
