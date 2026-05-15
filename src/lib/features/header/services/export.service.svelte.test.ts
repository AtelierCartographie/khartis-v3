import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'export.service.ts'),
  'utf8'
);

describe('export service geometry extraction', () => {
  it('exports WKB geometry through DuckDB spatial conversion instead of casting raw blobs', () => {
    expect(source).toContain('function buildGeometryExportSelect');
    expect(source).toContain('ST_GeomFromWKB');
    expect(source).not.toContain('ST_AsGeoJSON("${escapedName}"::GEOMETRY)');
  });

  it('allows map export when a rendered page canvas is available for facet collections', () => {
    expect(source).toContain('function hasRenderableMapOutput');
    expect(source).toContain(
      'if (!mapInstanceStore.isMapLoaded && !hasRenderableMapOutput())'
    );
    expect(source).toContain("'.page-container, .facets-page'");
    expect(source).toContain(
      "'.map-canvas canvas, .shared-facets-canvas canvas, canvas'"
    );
    expect(source).toContain('canvas.width > 0 && canvas.height > 0');
  });

  it('prefers joined basemap geometry over geocoding metadata for GeoJSON export', () => {
    const joinedGeometryLookupIndex = source.indexOf(
      'const joinedGeometrySource = resolveJoinedGeometryExportSource(dataset)'
    );
    const inlineGeometryFallbackIndex = source.indexOf(
      '!dataset.duckdbTableName'
    );

    expect(source).toContain('function resolveJoinedGeometryExportSource');
    expect(source).toContain('if (joinedGeometrySource && !geomColumn)');
    expect(joinedGeometryLookupIndex).toBeGreaterThan(-1);
    expect(inlineGeometryFallbackIndex).toBeGreaterThan(-1);
    expect(joinedGeometryLookupIndex).toBeLessThan(inlineGeometryFallbackIndex);
  });
});
