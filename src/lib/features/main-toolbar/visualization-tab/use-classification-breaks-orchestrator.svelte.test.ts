import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  }
}));

vi.mock('./use-classification-breaks.svelte', () => ({
  CLASSIFICATION_BREAKS_TRIGGER: {
    UNKNOWN: 'unknown',
    MISSING_BREAKS: 'missing-breaks',
    CLASSIFICATION_PARAMS_CHANGED: 'classification-params-changed'
  },
  buildClassificationScopeKey: vi.fn(
    (role, primitive) => `${role}:${String(primitive)}`
  ),
  SYMBOL_FILL_SCOPE_TARGET: 'symbol-fill',
  TEXT_BACKGROUND_SCOPE_TARGET: 'text-bg'
}));

import { useClassificationBreaksOrchestrator } from './use-classification-breaks-orchestrator.svelte';

interface OrchestratorBag {
  classificationBreaks: {
    compute: Mock;
    clearRetry: Mock;
  };
  isNumericDataField: Mock;
  updatePrimitiveClassificationState: Mock;
  updatePrimitiveStrokeClassificationState: Mock;
  applyLineThicknessClassification: Mock;
  applySymbolFillClassification: Mock;
  applyTextBackgroundClassification: Mock;
  applyTextBackgroundStrokeClassification: Mock;
  orchestrator: ReturnType<typeof useClassificationBreaksOrchestrator>;
}

function makeBag(opts: { isNumeric?: boolean } = {}): OrchestratorBag {
  const classificationBreaks = {
    compute: vi.fn().mockResolvedValue(undefined),
    clearRetry: vi.fn()
  };
  const isNumericDataField = vi.fn().mockReturnValue(opts.isNumeric ?? true);
  const noOp = vi.fn();
  const visualization = {
    polygon: { valueColumn: 'pop' },
    symbol: { valueColumn: 'sym_val' }
  };
  const updatePrimitiveClassificationState = vi.fn();
  const updatePrimitiveStrokeClassificationState = vi.fn();
  const applyLineThicknessClassification = vi.fn();
  const applySymbolFillClassification = vi.fn();
  const applyTextBackgroundClassification = vi.fn();
  const applyTextBackgroundStrokeClassification = vi.fn();

  const orchestrator = useClassificationBreaksOrchestrator({
    classificationBreaks: classificationBreaks as never,
    isNumericDataField,
    getDatasetId: () => 'ds-1',
    getPrimitiveValueColumn: vi.fn(() => 'pop'),
    getPrimitiveClassification: vi.fn(() => ({ method: 'jenks' }) as never),
    getPrimitiveStrokeValueColumn: vi.fn(() => 'stroke_val'),
    getPrimitiveStrokeClassification: vi.fn(
      () => ({ method: 'quantile' }) as never
    ),
    getSelectedVisualization: () => visualization as never,
    getLineThicknessTarget: () =>
      ({
        valueColumn: 'line_thick',
        classification: { method: 'jenks' }
      }) as never,
    getSymbolFillTarget: () =>
      ({
        valueColumn: 'symfill',
        classification: { method: 'jenks' }
      }) as never,
    getTextBackgroundTarget: () =>
      ({
        valueColumn: 'tb_val',
        classification: { method: 'jenks' }
      }) as never,
    getTextBackgroundStrokeTarget: () =>
      ({
        valueColumn: 'tbs_val',
        classification: { method: 'jenks' }
      }) as never,
    updatePrimitiveClassificationState,
    updatePrimitiveStrokeClassificationState,
    applyLineThicknessClassification,
    applySymbolFillClassification,
    applyTextBackgroundClassification,
    applyTextBackgroundStrokeClassification
  });

  void noOp;
  return {
    classificationBreaks,
    isNumericDataField,
    updatePrimitiveClassificationState,
    updatePrimitiveStrokeClassificationState,
    applyLineThicknessClassification,
    applySymbolFillClassification,
    applyTextBackgroundClassification,
    applyTextBackgroundStrokeClassification,
    orchestrator
  };
}

describe('useClassificationBreaksOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computeBreaksForPrimitive forwards to classificationBreaks.compute with fill scope', () => {
    const bag = makeBag();
    bag.orchestrator.computeBreaksForPrimitive('polygon' as never);
    expect(bag.classificationBreaks.compute).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: 'fill:polygon',
        datasetId: 'ds-1',
        valueColumn: 'pop',
        trigger: 'unknown'
      })
    );
  });

  it('skips compute when valueColumn is not numeric', () => {
    const bag = makeBag({ isNumeric: false });
    bag.orchestrator.computeBreaksForPrimitive('polygon' as never);
    expect(bag.classificationBreaks.compute).not.toHaveBeenCalled();
    expect(bag.classificationBreaks.clearRetry).toHaveBeenCalledWith(
      'fill:polygon'
    );
  });

  it('computeLineThicknessBreaks uses size scope and LINE primitive', () => {
    const bag = makeBag();
    bag.orchestrator.computeLineThicknessBreaks('missing-breaks' as never);
    expect(bag.classificationBreaks.compute).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: 'size:line',
        valueColumn: 'line_thick'
      })
    );
  });

  it('computeBreaksForStrokePrimitive uses stroke scope', () => {
    const bag = makeBag();
    bag.orchestrator.computeBreaksForStrokePrimitive('point' as never);
    expect(bag.classificationBreaks.compute).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: 'stroke:point',
        valueColumn: 'stroke_val'
      })
    );
  });

  it('computeSymbolFillBreaks scopes to SYMBOL_FILL_SCOPE_TARGET', () => {
    const bag = makeBag();
    bag.orchestrator.computeSymbolFillBreaks(
      'classification-params-changed' as never
    );
    expect(bag.classificationBreaks.compute).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKey: 'fill:symbol-fill' })
    );
  });

  it('computeTextBackgroundBreaks scopes to TEXT_BACKGROUND_SCOPE_TARGET fill', () => {
    const bag = makeBag();
    bag.orchestrator.computeTextBackgroundBreaks();
    expect(bag.classificationBreaks.compute).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKey: 'fill:text-bg' })
    );
  });

  it('computeTextBackgroundStrokeBreaks scopes to TEXT_BACKGROUND_SCOPE_TARGET stroke', () => {
    const bag = makeBag();
    bag.orchestrator.computeTextBackgroundStrokeBreaks();
    expect(bag.classificationBreaks.compute).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKey: 'stroke:text-bg' })
    );
  });

  it('applyUpdate of computeBreaksForPrimitive routes to updatePrimitiveClassificationState', () => {
    const bag = makeBag();
    bag.orchestrator.computeBreaksForPrimitive('polygon' as never);
    const applyUpdate = bag.classificationBreaks.compute.mock.calls[0][0]
      .applyUpdate as (u: object) => void;
    applyUpdate({ breaks: [1, 2] });
    expect(bag.updatePrimitiveClassificationState).toHaveBeenCalledWith(
      'polygon',
      { breaks: [1, 2] }
    );
  });
});
