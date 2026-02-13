<script lang="ts">
  import {
    visualizationStore,
    VisualizationType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    vizSuggester,
    type GeometryType,
    type VizSuggestion
  } from '$lib/features/commons/services/viz-suggester.service';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import type { ColumnAnalysis } from '$lib/features/data-pipeline';
  import ChooseVisualization from './choose-visualization.svelte';
  import ConfigureVisualization from './configure-visualization.svelte';
  import CustomizeBasemap from './customize-basemap.svelte';
  import ToolbarTabLayout from '../components/toolbar-tab-layout.svelte';
  import { onMount } from 'svelte';
  import { mapSuggestionToType } from './suggestion.utils';

  let configureSection: HTMLElement | undefined = $state();
  let initializedDatasetIds = $state<string[]>([]);
  let lastSnapshot = $state<string>('');

  function buildColumnAnalysis(dataset: {
    columns: Array<{
      name: string;
      type: string;
      stats?: {
        count?: number;
        nulls?: number;
        uniques?: number;
        min?: unknown;
        max?: unknown;
        mean?: number;
        share_integers?: number;
        share_floats?: number;
        share_rank_interval?: number;
        extent_magnitude?: number;
      };
    }>;
  }): ColumnAnalysis[] {
    return dataset.columns.map((col) => ({
      name: col.name,
      type: col.type,
      stats: {
        count: col.stats?.count ?? 0,
        nulls: col.stats?.nulls ?? 0,
        uniques: col.stats?.uniques ?? 0,
        min: col.stats?.min,
        max: col.stats?.max,
        mean: col.stats?.mean,
        share_integers: col.stats?.share_integers,
        share_floats: col.stats?.share_floats,
        share_rank_interval: col.stats?.share_rank_interval,
        extent_magnitude: col.stats?.extent_magnitude
      }
    }));
  }

  function resolveBestSuggestion(dataset: {
    columns: Array<{
      name: string;
      type: string;
      stats?: {
        count?: number;
        nulls?: number;
        uniques?: number;
        min?: unknown;
        max?: unknown;
        mean?: number;
      };
    }>;
    geometry?: { type?: string | null };
  }): VizSuggestion | undefined {
    const geometryType = dataset.geometry?.type;
    if (!geometryType) return undefined;

    const suggestions = vizSuggester.suggestVisualizations(
      buildColumnAnalysis(dataset),
      geometryType as GeometryType,
      { maxSuggestions: 1 }
    );

    return suggestions[0];
  }

  function applySuggestionMapping(
    vizId: string,
    vizType: VisualizationType,
    suggestion: VizSuggestion
  ): void {
    if (!suggestion.columns || suggestion.columns.length === 0) {
      return;
    }

    const column = suggestion.columns[0];
    const mappingUpdate: Record<string, string> = {};

    switch (vizType) {
      case VisualizationType.CHOROPLETH:
        mappingUpdate.valueColumn = column;
        break;
      case VisualizationType.PROPORTIONAL:
        mappingUpdate.sizeColumn = column;
        break;
      case VisualizationType.CATEGORICAL:
        mappingUpdate.categoryColumn = column;
        break;
      case VisualizationType.BIVARIATE:
        mappingUpdate.valueColumn = column;
        if (suggestion.columns.length > 1) {
          mappingUpdate.colorColumn = suggestion.columns[1];
        }
        break;
    }

    const viz = visualizationStore.visualizations.find((v) => v.id === vizId);
    if (!viz) return;

    visualizationStore.updateVisualization(vizId, {
      mapping: { ...viz.mapping, ...mappingUpdate }
    });
  }

  function handleCreateVisualization() {
    if (configureSection) {
      configureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  onMount(() => {
    logger.info('[visualization-tab] mounted', LogCategory.UI);
    return () => {
      logger.warn('[visualization-tab] unmounted', LogCategory.UI, {
        selectedDatasetId: datasetsStore.selectedDataset?.id,
        visualizationsCount: visualizationStore.visualizations.length
      });
    };
  });

  $effect(() => {
    const dataset = datasetsStore.selectedDataset;
    const datasetVisualizations = dataset
      ? visualizationStore.getVisualizationsByDataset(dataset.id)
      : [];
    const hasNoDatasetViz = datasetVisualizations.length === 0;
    const hasInitializedDataset = dataset
      ? initializedDatasetIds.includes(dataset.id)
      : false;
    const snapshot = `${dataset?.id ?? 'none'}|${datasetVisualizations.length}|${initializedDatasetIds.join(',')}`;

    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      logger.debug(
        '[visualization-tab] auto-create check snapshot',
        LogCategory.UI,
        {
          selectedDatasetId: dataset?.id,
          hasNoDatasetViz,
          hasInitializedDataset,
          selectedVisualizationId: visualizationStore.selectedVisualization?.id
        }
      );
    }

    if (dataset && !hasInitializedDataset) {
      initializedDatasetIds = [...initializedDatasetIds, dataset.id];

      if (hasNoDatasetViz) {
        const bestSuggestion = resolveBestSuggestion(dataset);
        const defaultType = bestSuggestion
          ? mapSuggestionToType(bestSuggestion.id)
          : dataset.geometry?.type?.toLowerCase().includes('point')
            ? VisualizationType.PROPORTIONAL
            : VisualizationType.CHOROPLETH;
        const viz = visualizationStore.createVisualization(
          defaultType,
          dataset.id
        );

        if (bestSuggestion) {
          applySuggestionMapping(viz.id, defaultType, bestSuggestion);
        }

        logger.info(
          '[visualization-tab] auto-created visualization from step entry',
          LogCategory.UI,
          {
            datasetId: dataset.id,
            defaultType,
            suggestionId: bestSuggestion?.id,
            suggestionColumns: bestSuggestion?.columns
          }
        );
      }
    }
  });
</script>

<ToolbarTabLayout id="khartis-viz-tab">
  <ChooseVisualization onCreateVisualization={handleCreateVisualization} />

  <div bind:this={configureSection}>
    <ConfigureVisualization />
  </div>

  <CustomizeBasemap />
</ToolbarTabLayout>
