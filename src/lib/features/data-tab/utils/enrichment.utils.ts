import {
  getGeoColumnDescription,
  type GeoColumnResult,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detection.utils';
import {
  GEO_COLUMN_TYPE,
  INTERNAL_COLUMN
} from '$lib/features/commons/constants/data.constants';
import type { DatasetResult } from '$lib/features/data-pipeline';
import * as m from '$lib/paraglide/messages';

export interface EnrichDataFieldItem {
  id: number;
  text: string;
  columnName: string;
  isGeo: boolean;
  confidence: number;
}

export interface GeoFileColumnItem {
  id: number;
  text: string;
  columnName: string;
}

export function buildEnrichDataFieldItems(
  enrichmentDataset: DatasetResult | null,
  geoDetection: GeoDetectionResult | null | undefined
): EnrichDataFieldItem[] {
  if (!enrichmentDataset) return [];

  return enrichmentDataset.columns
    .filter((col) => col.name !== INTERNAL_COLUMN.ID)
    .map((col, index) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc: GeoColumnResult) => gc.columnName === col.name
      );

      let displayText = col.name;
      if (geoCol) {
        const description = getGeoColumnDescription(geoCol);
        displayText = `${col.name} ${m.separator_en_dash()} ${description}`;
      }

      return {
        id: index,
        text: displayText,
        columnName: col.name,
        isGeo: !!geoCol,
        confidence: geoCol?.confidence || 0
      };
    });
}

export function buildGeoFileColumns(
  selectedDataset: { columns: Array<{ name: string }> } | null | undefined
): GeoFileColumnItem[] {
  if (!selectedDataset) return [];
  return selectedDataset.columns
    .filter(
      (col) =>
        col.name !== INTERNAL_COLUMN.GEOMETRY &&
        col.name !== INTERNAL_COLUMN.GEOM &&
        col.name !== INTERNAL_COLUMN.ID
    )
    .map((col, idx) => ({ id: idx, text: col.name, columnName: col.name }));
}

export function findSuggestedColumn(
  geoDetection: GeoDetectionResult | null | undefined,
  enrichDataFieldItems: EnrichDataFieldItem[]
): EnrichDataFieldItem | undefined {
  const suggested = geoDetection?.suggestedPrimaryGeoColumn;
  if (!suggested) return undefined;

  return enrichDataFieldItems.find(
    (item) => item.columnName === suggested.columnName
  );
}

export function hasOnlyCoordinates(
  geoDetection: GeoDetectionResult | null | undefined
): boolean {
  if (!geoDetection) return false;

  const geoColumns = geoDetection.geoColumns || [];
  if (geoColumns.length === 0) return false;

  const hasEntityColumn = geoColumns.some(
    (gc: GeoColumnResult) => gc.type === GEO_COLUMN_TYPE.IDENTIFIER
  );

  const hasCoordinates = geoColumns.some(
    (gc: GeoColumnResult) =>
      gc.type === GEO_COLUMN_TYPE.LATITUDE ||
      gc.type === GEO_COLUMN_TYPE.LONGITUDE
  );

  return hasCoordinates && !hasEntityColumn;
}

export const ACCEPTED_BASEMAP_EXTENSIONS = [
  '.geojson',
  '.json',
  '.shp',
  '.shx',
  '.dbf',
  '.prj',
  '.cpg',
  '.zip',
  '.gpkg',
  '.kml',
  '.parquet',
  '.geoparquet',
  '.gpq'
];
