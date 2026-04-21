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

  it('preserves suggestion origin when polygon classification defaults sync automatically', () => {
    expect(source).toContain(
      'visualizationStore.updateClassification(selectedViz.id, updates, options);'
    );
  });

  it('hydrates stroke categorical labels through stroke classification updates', () => {
    expect(source).toContain('function fetchStrokeCategoryLabels(');
    expect(source).toContain(
      'updatePrimitiveStrokeClassificationState(primitive, { labels })'
    );
    expect(source).toMatch(
      /for \(const target of primitiveStrokeClassificationTargets\)[\s\S]*fetchStrokeCategoryLabels\(/
    );
  });

  it('propagates symbol strokeDashed through panel derivation and style updates', () => {
    expect(source).toContain('strokeDashed: symbol.strokeDashed');
    expect(source).toContain(
      '? { strokeDashed: updates.strokeDashed ?? symbol.strokeDashed }'
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

  it('keeps SYMBOL_MODE_STATE_KEYS in sync with snapshotSymbolModeState body', () => {
    const snapshotMatch = source.match(
      /function snapshotSymbolModeState\([\s\S]*?\)\s*:\s*SymbolModeState\s*\{\s*return\s*\{([\s\S]*?)\};\s*\}/
    );
    expect(snapshotMatch).not.toBeNull();
    const snapshotBody = snapshotMatch![1];
    const snapshotKeys = Array.from(
      snapshotBody.matchAll(/^\s*(\w+)\s*:\s*symbol\.\w+/gm)
    ).map((m) => m[1]);

    const keysArrayMatch = source.match(
      /const SYMBOL_MODE_STATE_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/
    );
    expect(keysArrayMatch).not.toBeNull();
    const literalKeys = Array.from(
      keysArrayMatch![1].matchAll(/'([^']+)'/g)
    ).map((m) => m[1]);

    expect(snapshotKeys.length).toBeGreaterThan(10);
    expect(literalKeys.sort()).toEqual(snapshotKeys.sort());
  });

  it('snapshots the symbol mode state under the previous mode before restoring the next one', () => {
    expect(source).toMatch(
      /const existingModeStates\s*=\s*symbol\.modeStates\s*\?\?\s*\{\}/
    );
    expect(source).toMatch(
      /const nextModeState\s*=\s*modeChanging\s*\?\s*existingModeStates\[nextMode\]\s*:\s*undefined;/
    );
    expect(source).toMatch(
      /\[previousMode\]:\s*snapshotSymbolModeState\(symbol\)/
    );
    expect(source).toMatch(
      /nextModeState\s*\?\s*applySymbolModeStateFields\(symbol,\s*nextModeState\)\s*:\s*getDefaultSymbolModeStateFields\(nextMode\)/
    );
  });

  it('defaults categories mode to a borderless symbol state when no per-mode snapshot exists yet', () => {
    expect(source).toContain('function getDefaultSymbolModeStateFields(');
    expect(source).toContain('if (mode !== SymbolMode.CATEGORIES)');
    expect(source).toContain('strokeMode: StrokeMode.NONE');
    expect(source).toContain('strokeWidth: 0');
    expect(source).toContain('strokeOpacity: 1');
    expect(source).toContain('strokeDashed: false');
  });
});
