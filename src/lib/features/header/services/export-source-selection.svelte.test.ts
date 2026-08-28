import { describe, expect, it } from 'vitest';
import { shouldUseGpsGeometryExport } from './export-source-selection';

describe('export source selection', () => {
  it('should prefer GPS geometry when GPS mode also keeps a reference basemap', () => {
    expect(
      shouldUseGpsGeometryExport({
        hasGeometryColumn: false,
        hasJoinedGeometry: true,
        hasGpsColumns: true,
        gpsMode: true
      })
    ).toBe(true);
  });

  it('should prefer joined geometry for a non-GPS joined dataset', () => {
    expect(
      shouldUseGpsGeometryExport({
        hasGeometryColumn: false,
        hasJoinedGeometry: true,
        hasGpsColumns: true,
        gpsMode: false
      })
    ).toBe(false);
  });

  it('should use detected GPS geometry when no joined geometry exists', () => {
    expect(
      shouldUseGpsGeometryExport({
        hasGeometryColumn: false,
        hasJoinedGeometry: false,
        hasGpsColumns: true,
        gpsMode: undefined
      })
    ).toBe(true);
  });

  it('should preserve a direct geometry column over GPS coordinates', () => {
    expect(
      shouldUseGpsGeometryExport({
        hasGeometryColumn: true,
        hasJoinedGeometry: false,
        hasGpsColumns: true,
        gpsMode: true
      })
    ).toBe(false);
  });
});
