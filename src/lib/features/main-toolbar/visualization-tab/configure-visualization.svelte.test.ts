import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'configure-visualization.svelte'),
  'utf8'
);
const polygonHandlersSource = readFileSync(
  resolve(import.meta.dirname, 'adapters/polygon-handlers.svelte.ts'),
  'utf8'
);
const symbolHandlersSource = readFileSync(
  resolve(import.meta.dirname, 'adapters/symbol-handlers.svelte.ts'),
  'utf8'
);
const textHandlersSource = readFileSync(
  resolve(import.meta.dirname, 'adapters/text-handlers.svelte.ts'),
  'utf8'
);
const datasetAnalysisSource = readFileSync(
  resolve(import.meta.dirname, 'use-dataset-analysis.svelte.ts'),
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
    expect(datasetAnalysisSource).toContain('dataset.joinedBasemap');
    expect(datasetAnalysisSource).toContain('dataset.geoColumn');
    expect(datasetAnalysisSource).toContain(
      'duckDBOrchestrator.getDatasetBySourceFile'
    );
    expect(datasetAnalysisSource).toContain('duckDataset?.joinedBasemap');
    expect(datasetAnalysisSource).toContain('duckDataset?.gpsMode');
    expect(datasetAnalysisSource).toContain(
      'column.type === GEO_COLUMN_TYPE.LATITUDE'
    );
    expect(datasetAnalysisSource).toContain(
      'column.type === GEO_COLUMN_TYPE.LONGITUDE'
    );
  });

  it('delegates break computation to the shared controller', () => {
    expect(source).toContain("from './use-classification-breaks.svelte';");
    expect(source).toContain('useClassificationBreaksController');
    expect(source).toContain(
      'const classificationBreaks = useClassificationBreaksController({'
    );
    expect(source).toContain('useClassificationBreaksOrchestrator');
    const orchestrationSource = readFileSync(
      resolve(import.meta.dirname, 'use-visualization-orchestration.svelte.ts'),
      'utf8'
    );
    expect(orchestrationSource).toContain('resolveBreaksTrigger');
    expect(orchestrationSource).toContain('computeBreaksForPrimitive');
  });

  it('clears pending break retries when a break slot points to a non-numeric field', () => {
    expect(datasetAnalysisSource).toContain('function isNumericDataField(');
    expect(source).toContain(
      "from './use-classification-breaks-orchestrator.svelte'"
    );
    expect(source).toContain('useClassificationBreaksOrchestrator({');
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
    const orchestrationSource = readFileSync(
      resolve(import.meta.dirname, 'use-visualization-orchestration.svelte.ts'),
      'utf8'
    );
    expect(orchestrationSource).toContain(
      'getPrimitiveStrokeClassificationTargets'
    );
    expect(orchestrationSource).toContain('fetchStrokeCategoryLabels(');
  });

  it('propagates symbol strokeDashed through panel derivation and style updates', () => {
    expect(symbolHandlersSource).toContain("'strokeDashed'");
    expect(symbolHandlersSource).toContain('pickOwnedKeys(');
    expect(source).toContain('buildLinePanelVisualization');
    expect(source).toContain('buildPolygonPanelVisualization');
    expect(source).toContain('buildSymbolFillPanelVisualization');
    expect(source).toContain('buildSymbolPanelVisualization');
  });

  it('routes polygon density edits through a dedicated handler instead of generic polygon mapping', () => {
    expect(polygonHandlersSource).toContain(
      'function handlePolygonDensityChange(updates: Partial<DensityConfig>)'
    );
    expect(polygonHandlersSource).toContain('density: {');
    expect(polygonHandlersSource).toContain('...(viz?.density ?? {}),');
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
    expect(textHandlersSource).toContain('deps.updateTextBackground(');
    expect(textHandlersSource).toContain('handleTextChange({');
  });

  it('mounts the year filter only when the selected dataset exposes a real year dimension', () => {
    expect(source).toContain(
      "import YearFilter from './components/year-filter.svelte';"
    );
    expect(datasetAnalysisSource).toContain(
      "import { isLikelyYearColumn } from './components/year-filter.utils';"
    );
    expect(datasetAnalysisSource).toContain(
      'const hasYearDimension = $derived.by(() =>'
    );
    expect(datasetAnalysisSource).toContain(
      'return dataset.columns.some((column) => isLikelyYearColumn(column, rows));'
    );
    expect(source).toContain('{#if selectedViz && hasYearDimension}');
    expect(source).toContain('<YearFilter visualization={selectedViz} />');
  });

  it('delegates symbol mode snapshot/restore to the dedicated helper', () => {
    expect(symbolHandlersSource).toContain(
      "import { resolveSymbolModeTransition } from '../use-symbol-mode-state.svelte';"
    );
    expect(symbolHandlersSource).toContain(
      'const modeTransition = modeChanging'
    );
    expect(symbolHandlersSource).toContain(
      'resolveSymbolModeTransition(symbol, nextMode)'
    );
    expect(symbolHandlersSource).toContain(
      '...(modeTransition?.restoredStateFields ?? {}),'
    );
    expect(symbolHandlersSource).toContain(
      'modeStates: modeTransition?.nextModeStates ?? symbol.modeStates ?? {}'
    );
  });
});
