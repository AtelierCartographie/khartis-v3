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

  it('wires text background handlers independently from polygon handlers', () => {
    const textsConfigBlock = source.match(/<TextsConfig[\s\S]*?\/>/);
    expect(textsConfigBlock).not.toBeNull();
    const block = textsConfigBlock![0];

    expect(block).toContain(
      'onBackgroundStyleChange={handleTextBackgroundStyleChange}'
    );
    expect(block).toContain(
      'onBackgroundModesChange={handleTextBackgroundModesChange}'
    );
    expect(block).toContain(
      'onBackgroundClassificationChange={handleTextBackgroundClassificationChange}'
    );
    expect(block).toContain(
      'onBackgroundMappingChange={handleTextBackgroundMappingChange}'
    );
    expect(block).toContain(
      'onBackgroundInvertPalette={handleTextBackgroundPaletteInvert}'
    );

    expect(block).not.toContain(
      'onBackgroundStyleChange={handlePolygonStyleChange}'
    );
    expect(block).not.toContain(
      'onBackgroundModesChange={handlePolygonModesChange}'
    );
  });

  it('derives text background panel from text.background sub-config, not polygon', () => {
    expect(source).toContain('buildTextBackgroundPanelVisualization');
    expect(source).toContain(
      'const textBackgroundVisualization = $derived.by(() =>'
    );
    expect(source).toContain(
      'buildTextBackgroundPanelVisualization(selectedViz)'
    );
    expect(source).not.toMatch(
      /textBackgroundVisualization\s*=\s*\$derived[\s\S]*buildPolygonPanelVisualization/
    );
  });

  it('writes text background updates through the text primitive, not polygon', () => {
    expect(source).toContain('function updateTextBackground');
    expect(source).toContain('handleTextChange({');
  });

  it('mounts the year filter only when the selected dataset exposes a real year dimension', () => {
    expect(source).toContain(
      "import YearFilter from './components/year-filter.svelte';"
    );
    expect(source).toContain(
      "import { isLikelyYearColumn } from './components/year-filter.utils';"
    );
    expect(source).toContain('const hasYearDimension = $derived.by(() =>');
    expect(source).toContain(
      'return dataset.columns.some((column) => isLikelyYearColumn(column, rows));'
    );
    expect(source).toContain('{#if selectedViz && hasYearDimension}');
    expect(source).toContain('<YearFilter visualization={selectedViz} />');
  });
});
