import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'main-map.svelte'),
  'utf8'
);

describe('MainMap density mode loading', () => {
  it('detects density visualizations from the polygon fill mode (issue #93)', () => {
    expect(source).toContain('getPolygonPrimitive(viz)?.fillMode');
    expect(source).toContain('FillMode.DENSITY');
    expect(source).not.toContain('SymbolMode.DENSITY');
  });

  it('only loads density tables from active visualizations', () => {
    expect(source).toContain('visualizationStore.activeVisualizations');
    expect(source).not.toContain(
      'for (const viz of visualizationStore.visualizations)'
    );
  });

  it('keeps density tables separate from canonical dataset tables', () => {
    expect(source).toContain('displayDensityTables');
    expect(source).toContain('loadDensityTableForDisplay');
    expect(source).toContain('densityTables={displayDensityTables}');
    expect(source).not.toContain('return densityTable;');
  });

  it('does not apply a second color-blindness filter wrapper around ThematicMap', () => {
    expect(source).not.toContain('applyColorBlindnessFilter');
    expect(source).not.toContain('color-blindness-filters');
  });

  it('passes real responsive page dimensions to the map instead of scaling it with CSS', () => {
    expect(source).toContain('renderedPageWidth');
    expect(source).toContain('renderedPageHeight');
    expect(source).toContain('width={renderedPageWidth}');
    expect(source).toContain('height={renderedPageHeight}');
    expect(source).toContain('logicalWidth={formatState.width}');
    expect(source).toContain('logicalHeight={formatState.height}');
    expect(source).toContain('displayScale={renderedPageScale}');
  });

  it('reuses the top-right map status loader for reference basemap loading', () => {
    expect(source).toContain('showReferenceBasemapLoader');
    expect(source).toContain('mapLoadingStore.isReferenceBasemapLoading');
    expect(source).toContain('showMapStatusLoader');
    expect(source).toContain('m.basemap_loading()');
    expect(source).toContain('class="map-status-loader"');
  });
});
