import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DuckDBDataset } from '$lib/features/duckdb';
import type { BBox } from '../types';

type OrthographicDatasetRef =
  Pick<DatasetResult, 'geometry'> | null | undefined;
type OrthographicDuckDatasetRef =
  Pick<DuckDBDataset, 'joinedBasemap'> | null | undefined;

interface ResolveOrthographicReferenceBboxOptions {
  datasetBounds: BBox | null;
  datasetProjectedBbox?: BBox | null;
  shouldUseBasemapReference: boolean;
  basemapProjectedBbox?: BBox | null;
  basemapMainlandBbox?: BBox | null;
  preferDatasetBbox?: boolean;
}

interface ResolveOrthographicProjectionFitBboxOptions {
  datasetBbox: BBox | null;
  shouldUseBasemapReference: boolean;
  basemapMainlandBbox?: BBox | null;
  basemapBbox?: BBox | null;
  preferDatasetBbox?: boolean;
}

type OrthographicBounds = [[number, number], [number, number]];

function toOrthographicBounds(bbox: BBox): OrthographicBounds {
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]]
  ];
}

export function shouldUseBasemapReferenceInOrthographicView(
  dataset: OrthographicDatasetRef,
  duckDataset: OrthographicDuckDatasetRef,
  referenceBasemapId?: string | null
): boolean {
  if (Boolean(duckDataset?.joinedBasemap) && !dataset?.geometry) return true;

  if (referenceBasemapId) return true;
  return false;
}

export function resolveOrthographicReferenceBbox({
  datasetBounds,
  datasetProjectedBbox = null,
  shouldUseBasemapReference,
  basemapProjectedBbox = null,
  basemapMainlandBbox = null,
  preferDatasetBbox = false
}: ResolveOrthographicReferenceBboxOptions): BBox | null {
  if (!shouldUseBasemapReference || preferDatasetBbox) {
    return datasetProjectedBbox ?? datasetBounds;
  }

  return (
    basemapProjectedBbox ??
    basemapMainlandBbox ??
    datasetProjectedBbox ??
    datasetBounds
  );
}

export function resolveOrthographicProjectionFitBbox({
  datasetBbox,
  shouldUseBasemapReference,
  basemapMainlandBbox = null,
  basemapBbox = null,
  preferDatasetBbox = false
}: ResolveOrthographicProjectionFitBboxOptions): BBox | null {
  if (preferDatasetBbox && datasetBbox) {
    return datasetBbox;
  }

  if (shouldUseBasemapReference) {
    return basemapMainlandBbox ?? basemapBbox ?? datasetBbox;
  }

  return datasetBbox ?? basemapMainlandBbox ?? basemapBbox;
}

export function resolveOrthographicDatasetBounds(
  dataset: OrthographicDatasetRef,
  tableBounds: OrthographicBounds | null
): OrthographicBounds | null {
  const datasetBounds = dataset?.geometry?.bounds ?? null;
  const datasetOrthographicBounds = datasetBounds
    ? toOrthographicBounds(datasetBounds)
    : null;
  return tableBounds ?? datasetOrthographicBounds;
}
