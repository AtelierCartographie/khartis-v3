import type { Layer } from '@deck.gl/core';
import { SolidPolygonLayer } from '@deck.gl/layers';
import type { BinaryPolygonData } from '@ateliercartographie/geoarrow-deck-stream';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import { duckDBOrchestrator } from '$lib/features/duckdb';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { getLocale } from '$lib/paraglide/runtime';

import type { BasemapMetadata } from '../types/basemap.types';
import type { DeckDataRow, LayerContext } from '../types';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import { resolvePolygonParser } from './layer-geometry-parsers';
import { THEMATIC_OVERLAY_PARAMETERS } from './polygon-pattern-layer.utils';
import { buildSplitDatasetRowMapping } from './split-rendering-accessors';

const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];

/** What the tooltip reads from the reference-entity probe. */
export interface ReferenceEntityPickData {
  geometry: ArrowTable;
  dataset: ArrowTable;
  featureIdColumn: string;
  basemap: BasemapMetadata;
}

export interface ReferenceEntityProbeInput extends ReferenceEntityPickData {
  layerId: string;
  ctx: Pick<LayerContext, 'modelMatrix' | 'beforeId' | 'customProjection'>;
}

type ProbeLayerData = Record<string, unknown> & { length: number };

const probeDataCache = new WeakMap<BinaryPolygonData, ProbeLayerData>();

/**
 * Every entity of the reference basemap, drawn transparent under the
 * visualization layers: deck picks the topmost layer, so a joined entity keeps
 * its visualization's tooltip and an unjoined one still answers with its name.
 */
export function createReferenceEntityProbeLayer(
  input: ReferenceEntityProbeInput
): Layer<DeckDataRow> | null {
  const { layerId, ctx, geometry, dataset, featureIdColumn, basemap } = input;
  const polyData = resolvePolygonParser(ctx.customProjection)(geometry);
  if (polyData.length === 0) return null;

  let data = probeDataCache.get(polyData);
  if (!data) {
    const built = createCompatibleSolidPolygonLayerProps(polyData)
      .data as unknown as ProbeLayerData;
    built.featureIds = polyData.featureIds;
    built.khartisPickGeometry = polyData;
    // Invisible: it must not frame the map.
    built.khartisPickOnly = true;
    data = built;
    probeDataCache.set(polyData, data);
  }
  // Reused buffers still describe the latest finalized table.
  data.khartisReferenceEntity = {
    geometry,
    dataset,
    featureIdColumn,
    basemap
  } satisfies ReferenceEntityPickData;
  requestBasemapDisplayNames(basemap);

  return new SolidPolygonLayer({
    id: layerId,
    ...({ data } as Record<string, unknown>),
    _normalize: false,
    getFillColor: TRANSPARENT,
    pickable: true,
    parameters: THEMATIC_OVERLAY_PARAMETERS,
    ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
    ...(ctx.beforeId && { beforeId: ctx.beforeId }),
    dataComparator: (newData, oldData) => newData === oldData
  }) as Layer<DeckDataRow>;
}

export function readReferenceEntityPickData(
  layerData: unknown
): ReferenceEntityPickData | null {
  if (typeof layerData !== 'object' || layerData === null) return null;
  const pickData = Reflect.get(layerData, 'khartisReferenceEntity');
  return typeof pickData === 'object' && pickData !== null
    ? (pickData as ReferenceEntityPickData)
    : null;
}

const datasetRowsCache = new WeakMap<
  ArrowTable,
  WeakMap<ArrowTable, Map<string, Int32Array>>
>();

/** The finalized row joined to a basemap entity, as the split rendering reads it. */
export function resolveReferenceDatasetRow(
  pickData: Pick<
    ReferenceEntityPickData,
    'geometry' | 'dataset' | 'featureIdColumn'
  >,
  geomRow: number
): number | null {
  const { geometry, dataset, featureIdColumn } = pickData;
  let byDataset = datasetRowsCache.get(geometry);
  if (!byDataset) {
    byDataset = new WeakMap();
    datasetRowsCache.set(geometry, byDataset);
  }
  let byColumn = byDataset.get(dataset);
  if (!byColumn) {
    byColumn = new Map();
    byDataset.set(dataset, byColumn);
  }
  let mapping = byColumn.get(featureIdColumn);
  if (!mapping) {
    mapping = buildSplitDatasetRowMapping(geometry, dataset, featureIdColumn);
    byColumn.set(featureIdColumn, mapping);
  }
  const datasetRow = mapping[geomRow];
  return datasetRow === undefined || datasetRow < 0 ? null : datasetRow;
}

// Names are read on hover, long after the layer asked for them: a basemap
// keeps its lookup for the session, one per interface locale.
const displayNamesByKey = new Map<string, Map<string, string> | null>();

function displayNamesKey(basemap: BasemapMetadata): string {
  return `${basemap.file}:${getLocale()}`;
}

function requestBasemapDisplayNames(basemap: BasemapMetadata): void {
  const key = displayNamesKey(basemap);
  if (displayNamesByKey.has(key)) return;
  displayNamesByKey.set(key, null);
  duckDBOrchestrator
    .getBasemapDisplayNames(basemap)
    .then((names) => displayNamesByKey.set(key, names))
    .catch((error: unknown) => {
      // The entity id stands in for its name.
      logger.warn('Failed to load the basemap display names', LogCategory.MAP, {
        basemap: basemap.file,
        error
      });
    });
}

/** The entity's display name, or its id while the names load or lack it. */
export function resolveReferenceEntityName(
  pickData: ReferenceEntityPickData,
  geomRow: number
): string | null {
  const id = pickData.geometry.getChild(pickData.featureIdColumn)?.get(geomRow);
  if (id === null || id === undefined) return null;
  const key = String(id);
  return (
    displayNamesByKey.get(displayNamesKey(pickData.basemap))?.get(key) ?? key
  );
}
