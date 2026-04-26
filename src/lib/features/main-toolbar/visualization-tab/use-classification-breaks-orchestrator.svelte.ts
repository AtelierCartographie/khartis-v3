import type {
  ClassificationConfig,
  VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { PrimitiveFilterType } from '$lib/features/commons/store/visualization.store.svelte';
import {
  buildClassificationScopeKey,
  CLASSIFICATION_BREAKS_TRIGGER,
  SYMBOL_FILL_SCOPE_TARGET,
  TEXT_BACKGROUND_SCOPE_TARGET,
  type ClassificationBreakTrigger,
  useClassificationBreaksController
} from './use-classification-breaks.svelte';
import type {
  ClassifiablePrimitive,
  StrokeClassifiablePrimitive
} from './use-primitive-panel-controller.svelte';

type ClassificationBreaksController = ReturnType<
  typeof useClassificationBreaksController
>;

export interface ClassificationTarget {
  valueColumn?: string;
  classification?: ClassificationConfig;
}

export interface ClassificationBreaksOrchestratorOptions {
  classificationBreaks: ClassificationBreaksController;
  isNumericDataField: (column: string | undefined) => boolean;
  getDatasetId: () => string | undefined;
  getPrimitiveValueColumn: (
    viz: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ) => string | undefined;
  getPrimitiveClassification: (
    viz: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ) => ClassificationConfig | undefined;
  getPrimitiveStrokeValueColumn: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => string | undefined;
  getPrimitiveStrokeClassification: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => ClassificationConfig | undefined;
  getSelectedVisualization: () => VisualizationConfig | undefined;
  getLineThicknessTarget: () => ClassificationTarget | null | undefined;
  getSymbolFillTarget: () => ClassificationTarget | null | undefined;
  getTextBackgroundTarget: () => ClassificationTarget | null | undefined;
  getTextBackgroundStrokeTarget: () => ClassificationTarget | null | undefined;
  updatePrimitiveClassificationState: (
    primitive: ClassifiablePrimitive,
    updates: Partial<ClassificationConfig>
  ) => void;
  updatePrimitiveStrokeClassificationState: (
    primitive: StrokeClassifiablePrimitive,
    updates: Partial<ClassificationConfig>
  ) => void;
  applyLineThicknessClassification: (
    updates: Partial<ClassificationConfig>
  ) => void;
  applySymbolFillClassification: (
    updates: Partial<ClassificationConfig>
  ) => void;
  applyTextBackgroundClassification: (
    updates: Partial<ClassificationConfig>
  ) => void;
  applyTextBackgroundStrokeClassification: (
    updates: Partial<ClassificationConfig>
  ) => void;
}

export function useClassificationBreaksOrchestrator(
  opts: ClassificationBreaksOrchestratorOptions
) {
  function computeBreaksIfNumeric(
    scopeKey: string,
    valueColumn: string | undefined,
    classification: ClassificationConfig | undefined,
    applyUpdate: (updates: Partial<ClassificationConfig>) => void,
    trigger: ClassificationBreakTrigger
  ): void {
    if (!opts.isNumericDataField(valueColumn)) {
      opts.classificationBreaks.clearRetry(scopeKey);
      return;
    }
    void opts.classificationBreaks.compute({
      scopeKey,
      datasetId: opts.getDatasetId(),
      valueColumn,
      classification,
      trigger,
      applyUpdate
    });
  }

  function computeBreaksForPrimitive(
    primitive: ClassifiablePrimitive,
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const viz = opts.getSelectedVisualization();
    computeBreaksIfNumeric(
      buildClassificationScopeKey('fill', primitive),
      opts.getPrimitiveValueColumn(viz, primitive),
      opts.getPrimitiveClassification(viz, primitive),
      (updates) => opts.updatePrimitiveClassificationState(primitive, updates),
      trigger
    );
  }

  function computeLineThicknessBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = opts.getLineThicknessTarget();
    computeBreaksIfNumeric(
      buildClassificationScopeKey('size', PrimitiveFilterType.LINE),
      target?.valueColumn,
      target?.classification,
      opts.applyLineThicknessClassification,
      trigger
    );
  }

  function computeBreaksForStrokePrimitive(
    primitive: StrokeClassifiablePrimitive,
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const viz = opts.getSelectedVisualization();
    computeBreaksIfNumeric(
      buildClassificationScopeKey('stroke', primitive),
      opts.getPrimitiveStrokeValueColumn(viz, primitive),
      opts.getPrimitiveStrokeClassification(viz, primitive),
      (updates) =>
        opts.updatePrimitiveStrokeClassificationState(primitive, updates),
      trigger
    );
  }

  function computeSymbolFillBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = opts.getSymbolFillTarget();
    computeBreaksIfNumeric(
      buildClassificationScopeKey('fill', SYMBOL_FILL_SCOPE_TARGET),
      target?.valueColumn,
      target?.classification,
      opts.applySymbolFillClassification,
      trigger
    );
  }

  function computeTextBackgroundBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = opts.getTextBackgroundTarget();
    computeBreaksIfNumeric(
      buildClassificationScopeKey('fill', TEXT_BACKGROUND_SCOPE_TARGET),
      target?.valueColumn,
      target?.classification,
      opts.applyTextBackgroundClassification,
      trigger
    );
  }

  function computeTextBackgroundStrokeBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = opts.getTextBackgroundStrokeTarget();
    computeBreaksIfNumeric(
      buildClassificationScopeKey('stroke', TEXT_BACKGROUND_SCOPE_TARGET),
      target?.valueColumn,
      target?.classification,
      opts.applyTextBackgroundStrokeClassification,
      trigger
    );
  }

  return {
    computeBreaksForPrimitive,
    computeLineThicknessBreaks,
    computeBreaksForStrokePrimitive,
    computeSymbolFillBreaks,
    computeTextBackgroundBreaks,
    computeTextBackgroundStrokeBreaks
  };
}
