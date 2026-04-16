import { describe, expect, it } from 'vitest';
import type { Table as ArrowTable } from 'apache-arrow';
import {
  extractGeoArrowMetadata,
  tableHasGeoArrowMetadata
} from '$lib/features/data-pipeline/io/geoarrow-metadata';

function tableWithMeta(meta: Record<string, string>): ArrowTable {
  return {
    schema: { metadata: new Map(Object.entries(meta)), fields: [] }
  } as unknown as ArrowTable;
}

function tableWithoutMeta(): ArrowTable {
  return {
    schema: { metadata: new Map(), fields: [] }
  } as unknown as ArrowTable;
}

describe('geoarrow-metadata', () => {
  describe('tableHasGeoArrowMetadata', () => {
    it('returns true when "geo" key is present in schema metadata', () => {
      expect(tableHasGeoArrowMetadata(tableWithMeta({ geo: '{}' }))).toBe(true);
    });

    it('returns false when schema metadata has no "geo" key', () => {
      expect(tableHasGeoArrowMetadata(tableWithMeta({ other: 'val' }))).toBe(
        false
      );
      expect(tableHasGeoArrowMetadata(tableWithoutMeta())).toBe(false);
    });
  });

  describe('extractGeoArrowMetadata', () => {
    it('returns null for a table without geo metadata', () => {
      expect(extractGeoArrowMetadata(tableWithoutMeta())).toBeNull();
    });

    it('returns null for invalid JSON in geo metadata', () => {
      const result = extractGeoArrowMetadata(
        tableWithMeta({ geo: 'not-json' })
      );
      expect(result).toBeNull();
    });

    it('returns parsed GeoArrowMetadata when geo key holds valid structure', () => {
      const geoMeta = JSON.stringify({
        version: '1.0.0',
        primary_column: 'geometry',
        columns: {
          geometry: {
            encoding: 'WKB',
            crs: { id: { authority: 'EPSG', code: 4326 } }
          }
        }
      });
      const result = extractGeoArrowMetadata(tableWithMeta({ geo: geoMeta }));
      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.0');
    });
  });
});
