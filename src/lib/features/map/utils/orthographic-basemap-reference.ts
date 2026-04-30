import type { BBox } from '../types';
import type {
  BasemapMetadata,
  ProjectionPresets
} from '../types/basemap.types';
import {
  computeProjectedBboxForBasemap,
  getMainlandBboxForBasemap
} from './geoarrow-stream-bridge';

interface ViewportSize {
  width: number;
  height: number;
}

interface ResolveOrthographicBasemapReferenceBboxesOptions {
  basemapMeta: BasemapMetadata | null;
  projectionPresets: ProjectionPresets | null;
  viewportSize: ViewportSize;
  projectBbox: (bbox: BBox | null) => BBox | null;
}

export interface OrthographicBasemapReferenceBboxes {
  projectedBbox: BBox | null;
  fallbackBbox: BBox | null;
}

export function resolveOrthographicBasemapReferenceBboxes({
  basemapMeta,
  projectionPresets,
  viewportSize,
  projectBbox
}: ResolveOrthographicBasemapReferenceBboxesOptions): OrthographicBasemapReferenceBboxes {
  if (!basemapMeta) {
    return { projectedBbox: null, fallbackBbox: null };
  }

  const mainlandBbox = getMainlandBboxForBasemap(
    basemapMeta,
    projectionPresets
  );
  const fallbackBbox = mainlandBbox ?? basemapMeta.bbox ?? null;
  const projectedBbox =
    basemapMeta.proj_to?.type === 'composite'
      ? (computeProjectedBboxForBasemap(
          basemapMeta,
          projectionPresets,
          viewportSize.width,
          viewportSize.height
        ) ?? projectBbox(fallbackBbox))
      : projectBbox(fallbackBbox);

  return { projectedBbox, fallbackBbox };
}
