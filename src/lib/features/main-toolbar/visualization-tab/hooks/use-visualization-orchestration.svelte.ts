import { untrack } from 'svelte';
import {
  CLASSIFIABLE_PRIMITIVES,
  STROKE_CLASSIFIABLE_PRIMITIVES,
  type ClassifiablePrimitive,
  type StrokeClassifiablePrimitive
} from './use-primitive-panel-controller.svelte';
import {
  resolveBreaksTrigger,
  shouldFetchCategoryLabels
} from '../utils/breaks-trigger.utils';
import {
  syncPrimitiveColors,
  syncStrokeColors,
  type UseClassificationColorSyncDeps
} from './use-classification-color-sync.svelte';
import type {
  ClassificationTarget,
  LineThicknessTarget,
  StrokeClassificationTarget,
  SymbolFillTarget,
  TextBackgroundStrokeTarget,
  TextBackgroundTarget
} from '../utils/classification-targets.utils';
import type { BreaksTrigger } from '../utils/breaks-trigger.utils';
import type { CategoryLabelsDataset } from './use-category-labels-fetcher.svelte';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { DataFieldItem } from './use-dataset-analysis.svelte';
import type { DatasetResult } from '$lib/features/data-pipeline';

export interface VisualizationOrchestrationDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  getDataFieldItems: () => DataFieldItem[];
  getDatasetsVersion: () => number;
  getDatasets: () => DatasetResult[];
  getSelectedDataset: () => DatasetResult | undefined;
  getPrimitiveClassificationTargets: () => ClassificationTarget[];
  getPrimitiveStrokeClassificationTargets: () => StrokeClassificationTarget[];
  getLineThicknessTarget: () => LineThicknessTarget | null;
  getSymbolFillTarget: () => SymbolFillTarget | null;
  getTextBackgroundTarget: () => TextBackgroundTarget | null;
  getTextBackgroundStrokeTarget: () => TextBackgroundStrokeTarget | null;
  getPrimitiveColorParamsKey: () => string;
  getStrokeColorParamsKey: () => string;
  ensurePrimitiveClassificationDefaults: (
    primitive: ClassifiablePrimitive,
    viz: VisualizationConfig
  ) => void;
  ensureAutoColumns: (
    primitive: ClassifiablePrimitive,
    viz: VisualizationConfig
  ) => void;
  ensureLineThicknessClassificationDefaults: (viz: VisualizationConfig) => void;
  ensurePrimitiveStrokeClassificationDefaults: (
    primitive: StrokeClassifiablePrimitive,
    viz: VisualizationConfig
  ) => void;
  ensurePrimitiveStrokeAutoColumns: (
    primitive: StrokeClassifiablePrimitive,
    viz: VisualizationConfig
  ) => void;
  ensureSymbolFillClassificationDefaults: (viz: VisualizationConfig) => void;
  ensureSymbolFillAutoColumns: (viz: VisualizationConfig) => void;
  ensureTextBackgroundClassificationDefaults: (
    viz: VisualizationConfig
  ) => void;
  ensureTextBackgroundAutoColumns: (viz: VisualizationConfig) => void;
  ensureTextBackgroundStrokeClassificationDefaults: (
    viz: VisualizationConfig
  ) => void;
  ensureTextBackgroundStrokeAutoColumns: (viz: VisualizationConfig) => void;
  computeBreaksForPrimitive: (
    primitive: ClassifiablePrimitive,
    trigger: BreaksTrigger
  ) => void;
  computeBreaksForStrokePrimitive: (
    primitive: StrokeClassifiablePrimitive,
    trigger: BreaksTrigger
  ) => void;
  computeLineThicknessBreaks: (trigger: BreaksTrigger) => void;
  computeSymbolFillBreaks: (trigger: BreaksTrigger) => void;
  computeTextBackgroundBreaks: (trigger: BreaksTrigger) => void;
  computeTextBackgroundStrokeBreaks: (trigger: BreaksTrigger) => void;
  fetchCategoryLabels: (
    primitive: ClassifiablePrimitive,
    column: string,
    dataset: CategoryLabelsDataset,
    useUntrack: boolean
  ) => void;
  fetchStrokeCategoryLabels: (
    primitive: StrokeClassifiablePrimitive,
    column: string,
    dataset: CategoryLabelsDataset,
    useUntrack: boolean
  ) => void;
  fetchSymbolFillCategoryLabels: (
    column: string,
    dataset: CategoryLabelsDataset
  ) => void;
  fetchTextBackgroundCategoryLabels: (
    column: string,
    dataset: CategoryLabelsDataset
  ) => void;
  fetchTextBackgroundStrokeCategoryLabels: (
    column: string,
    dataset: CategoryLabelsDataset
  ) => void;
  getColorSyncDeps: () => UseClassificationColorSyncDeps;
}

export function useVisualizationOrchestration(
  deps: VisualizationOrchestrationDeps
): void {
  let autoColumnsFieldSignature = '';

  $effect(() => {
    const visualization = deps.getSelectedVisualization();
    if (!visualization) {
      return;
    }

    for (const primitive of CLASSIFIABLE_PRIMITIVES) {
      deps.ensurePrimitiveClassificationDefaults(primitive, visualization);
      deps.ensureAutoColumns(primitive, visualization);
    }

    deps.ensureLineThicknessClassificationDefaults(visualization);

    for (const primitive of STROKE_CLASSIFIABLE_PRIMITIVES) {
      deps.ensurePrimitiveStrokeClassificationDefaults(
        primitive,
        visualization
      );
      deps.ensurePrimitiveStrokeAutoColumns(primitive, visualization);
    }

    deps.ensureSymbolFillClassificationDefaults(visualization);
    deps.ensureSymbolFillAutoColumns(visualization);
    deps.ensureTextBackgroundClassificationDefaults(visualization);
    deps.ensureTextBackgroundAutoColumns(visualization);
    deps.ensureTextBackgroundStrokeClassificationDefaults(visualization);
    deps.ensureTextBackgroundStrokeAutoColumns(visualization);
  });

  $effect(() => {
    const visualization = deps.getSelectedVisualization();
    const fieldSignature = deps
      .getDataFieldItems()
      .map((field) => `${field.id}:${field.text}:${field.type ?? ''}`)
      .join('|');
    const nextSignature = `${visualization?.id ?? ''}:${fieldSignature}`;

    if (!visualization || nextSignature === autoColumnsFieldSignature) {
      return;
    }

    autoColumnsFieldSignature = nextSignature;
    if (deps.getDataFieldItems().length === 0) {
      return;
    }

    untrack(() => {
      for (const primitive of CLASSIFIABLE_PRIMITIVES) {
        deps.ensureAutoColumns(primitive, visualization);
      }

      for (const primitive of STROKE_CLASSIFIABLE_PRIMITIVES) {
        deps.ensurePrimitiveStrokeAutoColumns(primitive, visualization);
      }

      deps.ensureSymbolFillAutoColumns(visualization);
      deps.ensureTextBackgroundAutoColumns(visualization);
      deps.ensureTextBackgroundStrokeAutoColumns(visualization);
    });
  });

  $effect(() => {
    void deps.getDatasetsVersion();

    for (const target of deps.getPrimitiveClassificationTargets()) {
      const trigger = resolveBreaksTrigger(target);
      if (trigger) {
        deps.computeBreaksForPrimitive(target.primitive, trigger);
      }
    }

    for (const target of deps.getPrimitiveStrokeClassificationTargets()) {
      const trigger = resolveBreaksTrigger(target);
      if (trigger) {
        deps.computeBreaksForStrokePrimitive(target.primitive, trigger);
      }
    }

    const lineThicknessTarget = deps.getLineThicknessTarget();
    if (lineThicknessTarget) {
      const trigger = resolveBreaksTrigger(lineThicknessTarget);
      if (trigger) deps.computeLineThicknessBreaks(trigger);
    }

    const symbolFillTarget = deps.getSymbolFillTarget();
    if (symbolFillTarget) {
      const trigger = resolveBreaksTrigger(symbolFillTarget);
      if (trigger) deps.computeSymbolFillBreaks(trigger);
    }

    const textBackgroundTarget = deps.getTextBackgroundTarget();
    if (textBackgroundTarget) {
      const trigger = resolveBreaksTrigger(textBackgroundTarget);
      if (trigger) deps.computeTextBackgroundBreaks(trigger);
    }

    const textBackgroundStrokeTarget = deps.getTextBackgroundStrokeTarget();
    if (textBackgroundStrokeTarget) {
      const trigger = resolveBreaksTrigger(textBackgroundStrokeTarget);
      if (trigger) deps.computeTextBackgroundStrokeBreaks(trigger);
    }
  });

  $effect(() => {
    const visualization = deps.getSelectedVisualization();
    if (!visualization) {
      return;
    }

    const datasets = deps.getDatasets();
    const dataset =
      datasets.find((d) => d.id === visualization.datasetId) ??
      deps.getSelectedDataset();
    if (!dataset) {
      return;
    }

    for (const target of deps.getPrimitiveClassificationTargets()) {
      if (shouldFetchCategoryLabels(target)) {
        deps.fetchCategoryLabels(
          target.primitive,
          target.categoryColumn,
          dataset,
          true
        );
      }
    }

    for (const target of deps.getPrimitiveStrokeClassificationTargets()) {
      if (shouldFetchCategoryLabels(target)) {
        deps.fetchStrokeCategoryLabels(
          target.primitive,
          target.categoryColumn,
          dataset,
          true
        );
      }
    }

    const symbolFillTarget = deps.getSymbolFillTarget();
    if (shouldFetchCategoryLabels(symbolFillTarget)) {
      deps.fetchSymbolFillCategoryLabels(
        symbolFillTarget.categoryColumn,
        dataset
      );
    }

    const textBackgroundTarget = deps.getTextBackgroundTarget();
    if (shouldFetchCategoryLabels(textBackgroundTarget)) {
      deps.fetchTextBackgroundCategoryLabels(
        textBackgroundTarget.categoryColumn,
        dataset
      );
    }

    const textBackgroundStrokeTarget = deps.getTextBackgroundStrokeTarget();
    if (shouldFetchCategoryLabels(textBackgroundStrokeTarget)) {
      deps.fetchTextBackgroundStrokeCategoryLabels(
        textBackgroundStrokeTarget.categoryColumn,
        dataset
      );
    }
  });

  $effect(() => {
    void deps.getPrimitiveColorParamsKey();
    syncPrimitiveColors(deps.getColorSyncDeps());
  });

  $effect(() => {
    void deps.getStrokeColorParamsKey();
    syncStrokeColors(deps.getColorSyncDeps());
  });
}
