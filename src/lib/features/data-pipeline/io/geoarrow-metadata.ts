import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { GeoArrowMetadata } from '../types';
import { isGeoArrowMetadata } from '../types';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

export function extractGeoArrowMetadata(
  table: ArrowTable
): GeoArrowMetadata | null {
  if (!tableHasGeoArrowMetadata(table)) {
    return null;
  }

  try {
    const geoMetadataStr = table.schema.metadata.get('geo');
    if (!geoMetadataStr) {
      return null;
    }

    const parsed = JSON.parse(geoMetadataStr);

    if (!isGeoArrowMetadata(parsed)) {
      return null;
    }

    return parsed;
  } catch (error) {
    logger.warn('Failed to parse GeoArrow metadata', LogCategory.DATA, error);
    return null;
  }
}

export function tableHasGeoArrowMetadata(table: ArrowTable): boolean {
  return !!(table.schema.metadata && table.schema.metadata.has('geo'));
}
