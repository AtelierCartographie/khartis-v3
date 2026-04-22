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

  it('delegates break computation to the shared controller', () => {
    expect(source).toContain("from './use-classification-breaks.svelte';");
    expect(source).toContain('useClassificationBreaksController');
    expect(source).toContain('CLASSIFICATION_BREAKS_TRIGGER');
    expect(source).toContain('buildClassificationScopeKey');
    expect(source).toContain(
      'const classificationBreaks = useClassificationBreaksController({'
    );
    expect(source).toContain('classificationBreaks.compute({');
  });

  it('delegates shared primitive orchestration to the dedicated controller', () => {
    expect(source).toContain(
      "  } from './use-primitive-panel-controller.svelte';"
    );
    expect(source).toContain(
      'const primitivePanelController = usePrimitivePanelController({'
    );
    expect(source).toContain(
      'updateTextPrimitive: (updates) => handleTextChange(updates),'
    );
    expect(source).toContain('buildNextPrimitiveFilters,');
    expect(source).toContain('ensurePrimitiveClassificationDefaults,');
    expect(source).toContain('updateTextBackground,');
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
    expect(source).toContain(
      '? { strokeDashed: updates.strokeDashed ?? symbol.strokeDashed }'
    );
    expect(source).toContain('buildLinePanelVisualization');
    expect(source).toContain('buildPolygonPanelVisualization');
    expect(source).toContain('buildSymbolFillPanelVisualization');
    expect(source).toContain('buildSymbolPanelVisualization');
  });

  it('routes polygon density edits through a dedicated handler instead of generic polygon mapping', () => {
    expect(source).toContain(
      'function handlePolygonDensityChange(updates: Partial<DensityConfig>)'
    );
    expect(source).toContain('density: {');
    expect(source).toContain('...(selectedViz?.density ?? {}),');
    const polygonsConfigBlock = source.match(/<PolygonsConfig[\s\S]*?\/>/);
    expect(polygonsConfigBlock).not.toBeNull();
    expect(polygonsConfigBlock![0]).toContain(
      'onDensityChange={handlePolygonDensityChange}'
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
    expect(source).toContain('updateTextBackground((background) => ({');
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

  it('delegates symbol mode snapshot/restore to the dedicated helper', () => {
    expect(source).toContain(
      "import { resolveSymbolModeTransition } from './use-symbol-mode-state.svelte';"
    );
    expect(source).toContain('const modeTransition = modeChanging');
    expect(source).toContain('resolveSymbolModeTransition(symbol, nextMode)');
    expect(source).toContain('...(modeTransition?.restoredStateFields ?? {}),');
    expect(source).toContain(
      'modeStates: modeTransition?.nextModeStates ?? symbol.modeStates ?? {}'
    );
  });
});
