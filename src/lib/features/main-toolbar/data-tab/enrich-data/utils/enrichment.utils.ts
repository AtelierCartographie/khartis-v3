import {
  GeoColumnDetector,
  type GeoColumnResult,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import type { DatasetResult } from '$lib/features/data-pipeline';
import type { GeoComboBoxItem } from '../../data-tab.shared.types';

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
    .filter((col) => col.name !== '__id')
    .map((col, index) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc: GeoColumnResult) => gc.columnName === col.name
      );

      let displayText = col.name;
      if (geoCol) {
        const description = GeoColumnDetector.getGeoColumnDescription(geoCol);
        displayText = `${col.name} (${description})`;
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
        col.name !== 'geometry' && col.name !== 'geom' && col.name !== '__id'
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

  const entityTypes = ['country_name', 'iso2', 'iso3', 'region', 'city'];
  const hasEntityColumn = geoColumns.some((gc: GeoColumnResult) =>
    entityTypes.includes(gc.type)
  );

  const hasCoordinates = geoColumns.some(
    (gc: GeoColumnResult) => gc.type === 'latitude' || gc.type === 'longitude'
  );

  return hasCoordinates && !hasEntityColumn;
}

export function findEnrichDataFieldItemByColumnName(
  items: EnrichDataFieldItem[],
  columnName: string
): GeoComboBoxItem | undefined {
  const item = items.find((i) => i.columnName === columnName);
  if (!item) return undefined;
  return item;
}

export const ACCEPTED_ENRICHMENT_EXTENSIONS = ['.csv', '.tsv', '.txt'];

export const ACCEPTED_BASEMAP_EXTENSIONS = [
  '.geojson',
  '.json',
  '.shp',
  '.gpkg',
  '.kml',
  '.parquet'
];

export function enrichJoinStatsWithTargetOptions(
  stats: { entities: Array<{ status: string; matches?: string[]; selectedMapping?: string }> },
  allTargetOptions: string[]
): void {
  stats.entities = stats.entities.map((entity) => {
    if (entity.status === 'to_verify') {
      return {
        ...entity,
        basemapOptions: entity.matches?.length
          ? entity.matches
          : allTargetOptions.slice(0, 20),
        selectedMapping: entity.matches?.[0] || undefined
      };
    }
    return entity;
  });
}

export function getGeoTableNameFromDataset(
  dataset: { id: string; duckdbTableName?: string; tableName?: string } | null
): string | null {
  if (!dataset) return null;
  return dataset.duckdbTableName || dataset.tableName || dataset.id;
}
