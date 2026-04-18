import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'configure-visualization.svelte'),
  'utf8'
);

describe('ConfigureVisualization', () => {
  it('keeps primitive panels mounted and disables unsupported geometry tools', () => {
    expect(source).not.toContain('{#if showsSymbolsConfig}');
    expect(source).not.toContain('{#if showsPolygonsConfig}');
    expect(source).not.toContain('{#if showsLinesConfig}');

    expect(source).toContain('disabled={!showsSymbolsConfig}');
    expect(source).toContain('disabled={!showsPolygonsConfig}');
    expect(source).toContain('disabled={!showsLinesConfig}');
  });

  it('treats joined basemaps as renderable geometry for text tools', () => {
    expect(source).toContain('dataset.joinedBasemap');
    expect(source).toContain('dataset.geoColumn');
    expect(source).toContain('duckDBOrchestrator.getDatasetBySourceFile');
    expect(source).toContain('duckDataset?.joinedBasemap');
    expect(source).toContain('duckDataset?.gpsMode');
    expect(source).toContain('column.type === GEO_COLUMN_TYPE.LATITUDE');
    expect(source).toContain('column.type === GEO_COLUMN_TYPE.LONGITUDE');
  });

  it('keeps computed-break cache outside the reactive graph', () => {
    expect(source).toContain('const lastCompletedKey = untrack(() =>');
    expect(source).toContain('const inFlightKey = untrack(() =>');
    expect(source).toContain(
      'untrack(() => inFlightBreaksKeyByPrimitive.set(primitive, breaksKey));'
    );
  });
});
