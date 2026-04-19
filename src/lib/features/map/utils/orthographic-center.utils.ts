import type { ProjectionLike } from 'geoarrow-deck-stream';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import { getProjectionState } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
import type { BBox } from '../types';
import {
  basemapService,
  getPreferredBasemapFile
} from '../services/basemap.service.svelte';
import { projectionStore } from '../stores/projection.store.svelte';
import { shouldUseIdentityProjectionForDatasetCrs } from './dataset-crs';
import {
  buildProjectionForBasemap,
  getMainlandBboxForBasemap
} from './geoarrow-stream-bridge';
import { fitBasemapRenderProjection } from './fit-basemap-render-projection.utils';
import { shouldUseBasemapReferenceInOrthographicView } from './orthographic-reference';
import { resolveProjectionForRender } from './projection-priority';
import { resolveUserProjectionOverride } from './user-projection.utils';

interface OrthographicCenterInput {
  lon: number;
  lat: number;
  sourceFileId?: string;
}

function resolveDataset(sourceFileId?: string): DatasetResult | null {
  if (sourceFileId) {
    return datasetsStore.getDatasetBySourceFile(sourceFileId) ?? null;
  }

  return (
    datasetsStore.selectedDataset ??
    datasetsStore.enabledDatasets[0] ??
    datasetsStore.datasets[0] ??
    null
  );
}

function resolveDuckDataset(
  dataset: DatasetResult | null
): DuckDBDataset | null {
  if (!dataset?.sourceFileId) {
    return null;
  }

  return (
    duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId) ?? null
  );
}

function resolveProjectionMetadata(duckDataset: DuckDBDataset | null) {
  if (basemapStyleStore.referenceBasemapId) {
    return basemapService.currentMetadata;
  }

  if (!duckDataset?.joinedBasemap) {
    return basemapService.currentMetadata;
  }

  const preferredBasemapFile = getPreferredBasemapFile(
    basemapService.availableBasemaps,
    duckDataset.joinedBasemap
  );

  return (
    basemapService.availableBasemaps.find(
      (basemap) => basemap.file === preferredBasemapFile
    ) ?? basemapService.currentMetadata
  );
}

function resolveProjectionFitBbox(
  dataset: DatasetResult | null,
  duckDataset: DuckDBDataset | null,
  basemapMeta: ReturnType<typeof resolveProjectionMetadata>
): BBox | null {
  const mainlandBbox = basemapMeta
    ? getMainlandBboxForBasemap(basemapMeta, basemapService.projectionPresets)
    : null;

  if (!dataset) {
    return mainlandBbox ?? basemapMeta?.bbox ?? null;
  }

  if (shouldUseIdentityProjectionForDatasetCrs(dataset.geometry?.crs)) {
    return null;
  }

  const shouldUseBasemapReference = shouldUseBasemapReferenceInOrthographicView(
    dataset,
    duckDataset,
    basemapStyleStore.referenceBasemapId
  );

  if (shouldUseBasemapReference) {
    return (
      mainlandBbox ?? basemapMeta?.bbox ?? dataset.geometry?.bounds ?? null
    );
  }

  return dataset.geometry?.bounds ?? mainlandBbox ?? basemapMeta?.bbox ?? null;
}

function resolveProjectionOverride(
  fitBbox: BBox | null
): ProjectionLike | undefined {
  return resolveUserProjectionOverride({
    state: getProjectionState(),
    fitBbox,
    viewportSize: {
      width: Math.max(1, projectionStore.canvasSize.width),
      height: Math.max(1, projectionStore.canvasSize.height)
    },
    padding: projectionStore.fitPaddingPx,
    projectionPresets: basemapService.projectionPresets
  });
}

async function resolveOrthographicProjection(
  sourceFileId?: string
): Promise<ProjectionLike | undefined> {
  await basemapService.initialize();

  const dataset = resolveDataset(sourceFileId);
  const duckDataset = resolveDuckDataset(dataset);
  const basemapMeta = resolveProjectionMetadata(duckDataset);
  const fitBbox = resolveProjectionFitBbox(dataset, duckDataset, basemapMeta);
  const projectionState = getProjectionState();

  const defaultProjection =
    basemapMeta &&
    !basemapMeta.isCustom &&
    basemapMeta.proj_to?.type !== 'identity'
      ? fitBasemapRenderProjection({
          projection: buildProjectionForBasemap(
            basemapMeta,
            Math.max(1, projectionStore.canvasSize.width),
            Math.max(1, projectionStore.canvasSize.height),
            basemapService.projectionPresets
          ),
          metadata: basemapMeta,
          fitBbox,
          width: Math.max(1, projectionStore.canvasSize.width),
          height: Math.max(1, projectionStore.canvasSize.height),
          padding: projectionStore.fitPaddingPx
        })
      : undefined;
  const overrideProjection = resolveProjectionOverride(fitBbox);

  return resolveProjectionForRender(
    defaultProjection,
    overrideProjection,
    projectionState.overrideSource
  );
}

export async function resolveCenterCoordinates({
  lon,
  lat,
  sourceFileId
}: OrthographicCenterInput): Promise<{ x: number; y: number }> {
  if (!projectionStore.isProjectedCoordinates) {
    return { x: lon, y: lat };
  }

  try {
    const projection = await resolveOrthographicProjection(sourceFileId);
    if (!projection) {
      return { x: lon, y: lat };
    }

    const projected = (
      projection as unknown as (
        coordinates: [number, number]
      ) => [number, number] | null
    )([lon, lat]);

    if (
      !projected ||
      !Number.isFinite(projected[0]) ||
      !Number.isFinite(projected[1])
    ) {
      return { x: lon, y: lat };
    }

    return {
      x: projected[0],
      y: projected[1]
    };
  } catch {
    return { x: lon, y: lat };
  }
}
