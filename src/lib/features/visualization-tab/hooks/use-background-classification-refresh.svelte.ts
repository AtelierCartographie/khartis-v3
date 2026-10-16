import { untrack } from 'svelte';
import {
  ColorMode,
  FillMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import { resolveValueScopeClause } from '$lib/features/commons/services/row-scope.service';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  ClassificationMethod,
  PrimitiveFilterType,
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitiveClassification,
  getPrimitiveValueColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  visualizationStore,
  type ClassificationConfig,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  buildClassificationUpdate,
  computeClassificationBreaks
} from './use-classification-breaks.svelte';
import { resolveClassableFieldKind } from './use-dataset-analysis.svelte';

interface RefreshTarget {
  key: string;
  primitive: PrimitiveFilter;
  valueColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  apply: (updates: Partial<ClassificationConfig>) => void;
}

const PRESERVE_ORIGIN = { preserveOrigin: true } as const;

function listClassedTargets(viz: VisualizationConfig): RefreshTarget[] {
  const id = viz.id;
  const targets: RefreshTarget[] = [];
  const polygon = getPolygonPrimitive(viz);
  const symbol = getSymbolPrimitive(viz);
  const line = getLinePrimitive(viz);
  const text = getTextPrimitive(viz);

  if (polygon?.enabled && polygon.fillMode === FillMode.CLASSES) {
    targets.push({
      key: 'fill:polygon',
      primitive: PrimitiveFilterType.POLYGON,
      valueColumn: getPrimitiveValueColumn(viz, PrimitiveFilterType.POLYGON),
      classification: getPrimitiveClassification(
        viz,
        PrimitiveFilterType.POLYGON
      ),
      apply: (updates) =>
        visualizationStore.updateClassification(id, updates, PRESERVE_ORIGIN)
    });
  }
  if (polygon?.enabled && polygon.strokeMode === StrokeMode.CLASSES) {
    targets.push({
      key: 'stroke:polygon',
      primitive: PrimitiveFilterType.POLYGON,
      valueColumn: polygon.strokeValueColumn,
      classification: polygon.strokeClassification,
      apply: (updates) =>
        visualizationStore.updatePrimitiveStrokeClassification(
          id,
          PrimitiveFilterType.POLYGON,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }
  if (symbol?.enabled && symbol.mode === SymbolMode.CLASSES) {
    targets.push({
      key: 'fill:point',
      primitive: PrimitiveFilterType.POINT,
      valueColumn: getPrimitiveValueColumn(viz, PrimitiveFilterType.POINT),
      classification: getPrimitiveClassification(
        viz,
        PrimitiveFilterType.POINT
      ),
      apply: (updates) =>
        visualizationStore.updatePrimitiveClassification(
          id,
          PrimitiveFilterType.POINT,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }
  if (symbol?.enabled && symbol.fillMode === FillMode.CLASSES) {
    targets.push({
      key: 'fill:symbol-fill',
      primitive: PrimitiveFilterType.POINT,
      valueColumn: getSymbolFillValueColumn(viz),
      classification: getSymbolFillClassification(viz),
      apply: (updates) =>
        visualizationStore.updateSymbolFillClassification(
          id,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }
  if (symbol?.enabled && symbol.strokeMode === StrokeMode.CLASSES) {
    targets.push({
      key: 'stroke:point',
      primitive: PrimitiveFilterType.POINT,
      valueColumn: symbol.strokeValueColumn,
      classification: symbol.strokeClassification,
      apply: (updates) =>
        visualizationStore.updatePrimitiveStrokeClassification(
          id,
          PrimitiveFilterType.POINT,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }
  if (line?.enabled && line.colorMode === ColorMode.CLASSES) {
    targets.push({
      key: 'fill:line',
      primitive: PrimitiveFilterType.LINE,
      valueColumn: getPrimitiveValueColumn(viz, PrimitiveFilterType.LINE),
      classification: getPrimitiveClassification(viz, PrimitiveFilterType.LINE),
      apply: (updates) =>
        visualizationStore.updatePrimitiveClassification(
          id,
          PrimitiveFilterType.LINE,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }
  if (line?.enabled && line.thicknessMode === ThicknessMode.CLASSES) {
    targets.push({
      key: 'size:line',
      primitive: PrimitiveFilterType.LINE,
      valueColumn: line.valueColumn,
      classification: getLineThicknessClassification(viz),
      apply: (updates) =>
        visualizationStore.updateLineThicknessClassification(
          id,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }
  if (text?.enabled && text.colorMode === ColorMode.CLASSES) {
    targets.push({
      key: 'fill:text',
      primitive: PrimitiveFilterType.TEXT,
      valueColumn: getPrimitiveValueColumn(viz, PrimitiveFilterType.TEXT),
      classification: getPrimitiveClassification(viz, PrimitiveFilterType.TEXT),
      apply: (updates) =>
        visualizationStore.updatePrimitiveClassification(
          id,
          PrimitiveFilterType.TEXT,
          updates,
          PRESERVE_ORIGIN
        )
    });
  }

  return targets;
}

/**
 * Keeps the breaks of the visualizations that are not on screen in the
 * panel up to date. The panel recomputes the selected visualization only, so
 * a table or visualization filter left the others, and their legends, on
 * breaks computed for rows no longer shown.
 *
 * Each classification is recorded with the inputs its breaks came from;
 * the first sighting trusts the stored breaks, and only a later change of
 * inputs (filter, column, method, class count) recomputes. The selected
 * visualization is recorded too, without computing, so it is not recomputed
 * once the panel lets it go.
 */
export function useBackgroundClassificationRefresh(): void {
  const lastInputs = new Map<string, string>();
  const requestIds = new Map<string, number>();

  async function refresh(
    scope: string,
    inputs: string,
    target: RefreshTarget,
    datasetSourceFileId: string,
    rowScopeClause: string | null,
    method: ClassificationMethod
  ): Promise<void> {
    const requestId = (requestIds.get(scope) ?? 0) + 1;
    requestIds.set(scope, requestId);
    try {
      const computation = await computeClassificationBreaks({
        datasetSourceFileId,
        valueColumn: target.valueColumn as string,
        rowScopeClause,
        classification: target.classification,
        method,
        numClasses: target.classification?.numClasses
      });
      if (!computation || requestIds.get(scope) !== requestId) return;
      if (lastInputs.get(scope) !== inputs) return;
      target.apply(
        buildClassificationUpdate(computation, target.classification, method)
      );
    } catch (error) {
      logger.warn('Background classification refresh failed', LogCategory.UI, {
        scope,
        error
      });
    }
  }

  $effect(() => {
    void duckDBOrchestrator.datasetsVersion;
    const visualizations = visualizationStore.visualizations;
    const selectedId = visualizationStore.selectedVisualization?.id;
    const datasets = datasetsStore.datasets;

    untrack(() => {
      for (const viz of visualizations) {
        if (viz.facet || !viz.datasetId) continue;
        const dataset = datasets.find((item) => item.id === viz.datasetId);
        if (!dataset?.sourceFileId) continue;

        for (const target of listClassedTargets(viz)) {
          const method = target.classification?.method;
          const columnType = dataset.columns?.find(
            (column) => column.name === target.valueColumn
          )?.type;
          if (
            !method ||
            method === ClassificationMethod.MANUAL ||
            !resolveClassableFieldKind(columnType)
          ) {
            continue;
          }

          const rowScopeClause = resolveValueScopeClause({
            datasetId: dataset.sourceFileId,
            vizFilters: viz.dataFilters,
            primitive: target.primitive
          });
          const scope = `${viz.id}|${target.key}`;
          const inputs = [
            dataset.sourceFileId,
            target.valueColumn,
            method,
            target.classification?.numClasses ?? target.classification?.classes,
            target.classification?.calendarStep
              ? `${target.classification.calendarStep.count}${target.classification.calendarStep.unit}`
              : 'none',
            rowScopeClause ?? 'all'
          ].join('|');
          const previous = lastInputs.get(scope);
          lastInputs.set(scope, inputs);

          if (previous === undefined || previous === inputs) continue;
          if (viz.id === selectedId) continue;

          void refresh(
            scope,
            inputs,
            target,
            dataset.sourceFileId,
            rowScopeClause,
            method
          );
        }
      }
    });
  });
}
