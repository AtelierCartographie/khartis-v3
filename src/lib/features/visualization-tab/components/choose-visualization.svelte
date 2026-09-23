<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
  import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    getVisualizationOriginMode,
    visualizationStore
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox } from 'carbon-components-svelte';
  import { Edit, MagicWandFilled, Pin } from 'carbon-icons-svelte';
  import VisualizationSuggestionCard from './suggestion/visualization-suggestion-card.svelte';
  import { InfoPopover } from './shared';
  import MainToolBarHeader from '$lib/features/main-toolbar/components/main-toolbar-header.svelte';
  import {
    applyBlankVisualizationPreset,
    applyEmptyVisualizationPreset,
    applySuggestionToVisualization,
    buildSuggestionOrigin,
    isVisualizationMatchingSuggestion,
    isVisualizationBlank,
    restoreVisualizationFromSuggestion,
    resolveBlankVisualizationType
  } from '../services/suggestion.service';
  import {
    getSuggestionSignature,
    includePersistedSuggestion,
    resolveDisplayedSuggestionKey,
    resolveSuggestionCardAction,
    shouldAutoApplySuggestion,
    shouldIncludePersistedSuggestion
  } from '../utils/suggestion-selection.utils';
  import { UI_CONSTANTS } from '$lib/features/commons/constants/visualization.constants';
  import {
    computeVisualizationSuggestions,
    resolveColumnBadgeType
  } from '../utils/compute-suggestions.utils';

  interface Props {
    onCreateVisualization?: () => void;
  }

  const { onCreateVisualization }: Props = $props();

  let selectedDatasetId = $state<string>(datasetsStore.selectedDatasetId ?? '');
  let suggestionsExpanded = $state(true);
  let visibleCount = $state<number>(UI_CONSTANTS.SUGGESTIONS_PER_PAGE);
  let autoAppliedSuggestionKey = $state<string | undefined>(undefined);
  let previousSuggestionDatasetId = $state<string | undefined>(undefined);
  let selectedSuggestionKey = $state<string | undefined>(undefined);

  const datasetItems = $derived.by(() =>
    datasetsStore.datasets.map((ds, id) => ({
      id,
      text: ds.name,
      datasetId: ds.id
    }))
  );

  const selectedDataset = $derived.by(() => {
    if (selectedDatasetId) {
      return (
        datasetsStore.datasets.find((ds) => ds.id === selectedDatasetId) ?? null
      );
    }
    return datasetsStore.selectedDataset ?? null;
  });

  const datasetColumns = $derived(selectedDataset?.columns ?? []);

  function getEditableVisualizationsByDataset(datasetId: string) {
    return visualizationStore
      .getVisualizationsByDataset(datasetId)
      .filter((visualization) => !visualization.facet);
  }

  const suggestions = $derived.by((): VizSuggestion[] => {
    void duckDBOrchestrator.datasetsVersion;
    return computeVisualizationSuggestions(selectedDataset);
  });

  function getColumnBadgeType(columnName: string): VariableBadgeType {
    return resolveColumnBadgeType(datasetColumns, columnName);
  }

  function handleShowMore() {
    visibleCount = Math.min(
      visibleCount + UI_CONSTANTS.SUGGESTIONS_PER_PAGE,
      displayedSuggestions.length
    );
  }

  function getCurrentTargetVisualization() {
    const dataset = selectedDataset;
    if (!dataset) {
      return undefined;
    }

    const currentSelection = visualizationStore.selectedVisualization;
    if (currentSelection?.datasetId === dataset.id) {
      return currentSelection;
    }

    return getEditableVisualizationsByDataset(dataset.id)[0];
  }

  function handleSelectSuggestion(suggestion: VizSuggestion) {
    const dataset = selectedDataset;
    if (!dataset) return;

    const targetViz =
      getCurrentTargetVisualization() ??
      visualizationStore.createVisualization(
        resolveBlankVisualizationType(dataset),
        dataset.id
      );

    const action = resolveSuggestionCardAction(
      {
        displayedSuggestionKey: appliedSuggestionKey,
        originSuggestionKey: targetViz.origin?.suggestionKey,
        originMode: getVisualizationOriginMode(targetViz),
        hasRestoreState: Boolean(targetViz.origin?.restoreState),
        isTargetActive: visualizationStore.activeVisualizations.some(
          (visualization) => visualization.id === targetViz.id
        )
      },
      suggestion
    );

    if (action === 'clear') {
      if (!restoreVisualizationFromSuggestion(targetViz.id)) {
        applyBlankVisualizationPreset(targetViz.id, dataset, {
          mode: 'manual-blank'
        });
      }
      selectedSuggestionKey = undefined;
      return;
    }

    const suggestionKey = getSuggestionSignature(suggestion);
    applySuggestionToVisualization(targetViz.id, suggestion, {
      origin: buildSuggestionOrigin(targetViz, {
        mode: 'manual-suggestion',
        suggestionKey
      })
    });

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === targetViz.id
    );
    if (!updatedVisualization) {
      selectedSuggestionKey = undefined;
      return;
    }

    selectedSuggestionKey = suggestionKey;
  }

  function handleCreateVisualization() {
    const dataset = selectedDataset;
    if (!dataset) return;

    const targetViz = getCurrentTargetVisualization();
    if (targetViz) {
      applyEmptyVisualizationPreset(targetViz.id, dataset, {
        mode: 'manual-blank'
      });
    } else {
      const visualization = visualizationStore.createVisualization(
        resolveBlankVisualizationType(dataset),
        dataset.id
      );
      applyEmptyVisualizationPreset(visualization.id, dataset, {
        mode: 'manual-blank'
      });
    }

    selectedSuggestionKey = undefined;
    suggestionsExpanded = false;
    onCreateVisualization?.();
  }

  const datasetVisualizations = $derived.by(() => {
    void visualizationStore.version;

    if (!selectedDataset) return [];
    return getEditableVisualizationsByDataset(selectedDataset.id);
  });

  const targetVisualization = $derived.by(() => {
    void visualizationStore.version;

    const currentSelection = visualizationStore.selectedVisualization;
    if (
      currentSelection &&
      datasetVisualizations.some((viz) => viz.id === currentSelection.id)
    ) {
      return currentSelection;
    }

    return datasetVisualizations[0];
  });

  const matchedSuggestionKey = $derived.by(() => {
    const dataset = selectedDataset;
    const targetViz = targetVisualization;

    if (!dataset || !targetViz) {
      return undefined;
    }

    const appliedSuggestion = suggestions.find((suggestion) =>
      isVisualizationMatchingSuggestion(targetViz, dataset, suggestion)
    );

    return appliedSuggestion
      ? getSuggestionSignature(appliedSuggestion)
      : undefined;
  });

  const targetVisualizationOriginMode = $derived(
    getVisualizationOriginMode(targetVisualization)
  );

  const displayedSuggestions = $derived.by(() => {
    const origin = targetVisualization?.origin;

    if (
      !shouldIncludePersistedSuggestion({
        hasAppliedSuggestionState: Boolean(origin?.appliedSuggestionState),
        hasPersistedSuggestionKey: Boolean(origin?.suggestionKey),
        originMode: targetVisualizationOriginMode
      })
    ) {
      return suggestions;
    }

    return includePersistedSuggestion(
      suggestions,
      origin?.suggestionKey,
      suggestions[0]?.dataGeometry
    );
  });

  const visibleSuggestions = $derived(
    displayedSuggestions.slice(0, visibleCount)
  );
  const hasMoreSuggestions = $derived(
    visibleCount < displayedSuggestions.length
  );

  const persistedSuggestionKey = $derived.by(() => {
    const targetViz = targetVisualization;

    if (!targetViz?.origin?.suggestionKey) {
      return undefined;
    }

    const originMode = getVisualizationOriginMode(targetViz);
    if (
      originMode !== 'auto-suggestion' &&
      originMode !== 'manual-suggestion' &&
      originMode !== 'custom'
    ) {
      return undefined;
    }

    const originSuggestionKey = targetViz.origin.suggestionKey;
    const suggestionStillExists = displayedSuggestions.some(
      (suggestion) => getSuggestionSignature(suggestion) === originSuggestionKey
    );

    return suggestionStillExists ? originSuggestionKey : undefined;
  });

  const appliedSuggestionKey = $derived(
    resolveDisplayedSuggestionKey({
      selectedSuggestionKey,
      persistedSuggestionKey,
      matchedSuggestionKey,
      originMode: targetVisualization?.origin
        ? getVisualizationOriginMode(targetVisualization)
        : undefined
    })
  );

  const autoSuggestionContextKey = $derived.by(() => {
    const targetViz = targetVisualization;

    if (!targetViz || suggestions.length === 0) {
      return undefined;
    }

    if (
      !shouldAutoApplySuggestion({
        hasPersistedSuggestionKey: Boolean(targetViz.origin?.suggestionKey),
        suggestionCount: suggestions.length,
        visualizationCount: datasetVisualizations.length,
        targetVisualizationOriginMode
      })
    ) {
      return undefined;
    }

    const suggestionSignature = getSuggestionSignature(suggestions[0]);
    const dataset = selectedDataset;
    const joinSignature =
      dataset?.joinedBasemap ?? (dataset?.geometry?.type ? 'native' : 'none');

    return `${targetViz.datasetId}::${targetViz.id}::${joinSignature}::${suggestionSignature}`;
  });

  $effect(() => {
    const datasets = datasetsStore.datasets;
    if (!datasets.length) {
      return;
    }
    const exists = datasets.some((ds) => ds.id === selectedDatasetId);
    if (!exists) {
      selectedDatasetId = datasetsStore.selectedDatasetId ?? datasets[0].id;
      visibleCount = UI_CONSTANTS.SUGGESTIONS_PER_PAGE;
      selectedSuggestionKey = undefined;
    }
  });

  $effect(() => {
    const datasetId = selectedDatasetId;
    if (!datasetId) return;

    untrack(() => {
      if (datasetsStore.selectedDatasetId === datasetId) return;
      if (!datasetsStore.datasets.some((dataset) => dataset.id === datasetId)) {
        return;
      }
      datasetsStore.selectDataset(datasetId);
    });
  });

  $effect(() => {
    const dataset = selectedDataset;

    if (!dataset) {
      previousSuggestionDatasetId = undefined;
      autoAppliedSuggestionKey = undefined;
      return;
    }

    if (previousSuggestionDatasetId === dataset.id) {
      return;
    }

    previousSuggestionDatasetId = dataset.id;
    visibleCount = UI_CONSTANTS.SUGGESTIONS_PER_PAGE;
    suggestionsExpanded = true;
    autoAppliedSuggestionKey = undefined;
    selectedSuggestionKey = undefined;
  });

  $effect(() => {
    const targetViz = targetVisualization;

    if (!selectedSuggestionKey || !targetViz) {
      return;
    }

    const suggestionStillExists = displayedSuggestions.some(
      (suggestion) =>
        getSuggestionSignature(suggestion) === selectedSuggestionKey
    );
    const originMode = getVisualizationOriginMode(targetViz);
    const keepsSelectionByOrigin =
      (originMode === 'auto-suggestion' ||
        originMode === 'manual-suggestion') &&
      targetViz.origin?.suggestionKey === selectedSuggestionKey;
    const keepsSelectionByMatch =
      matchedSuggestionKey === selectedSuggestionKey;

    if (
      !suggestionStillExists ||
      (!keepsSelectionByOrigin && !keepsSelectionByMatch)
    ) {
      selectedSuggestionKey = undefined;
    }
  });

  $effect(() => {
    const targetViz = targetVisualization;

    if (!targetViz) {
      return;
    }

    if (visualizationStore.selectedVisualization?.id !== targetViz.id) {
      visualizationStore.selectVisualization(targetViz.id);
    }
  });

  $effect(() => {
    const dataset = selectedDataset;
    const autoContextKey = autoSuggestionContextKey;
    const topSuggestion = suggestions[0];
    const targetViz = targetVisualization;

    if (!dataset || !targetViz) {
      return;
    }

    if (!topSuggestion) {
      if (
        targetVisualizationOriginMode === 'auto-suggestion' &&
        !isVisualizationBlank(targetViz, dataset)
      ) {
        applyBlankVisualizationPreset(targetViz.id, dataset, {
          mode: 'auto-suggestion'
        });
        autoAppliedSuggestionKey = `${dataset.id}::${targetViz.id}::blank`;
        selectedSuggestionKey = undefined;
      }
      return;
    }

    if (!autoContextKey) {
      return;
    }

    if (
      autoAppliedSuggestionKey === autoContextKey &&
      isVisualizationMatchingSuggestion(targetViz, dataset, topSuggestion)
    ) {
      return;
    }

    autoAppliedSuggestionKey = autoContextKey;
    const suggestionKey = getSuggestionSignature(topSuggestion);
    applySuggestionToVisualization(targetViz.id, topSuggestion, {
      origin: buildSuggestionOrigin(targetViz, {
        mode: 'auto-suggestion',
        suggestionKey
      })
    });
    selectedSuggestionKey = suggestionKey;
  });
</script>

<section id="choose-visualization">
  <MainToolBarHeader title={m.step1_title()} icon={Pin} showDivider />

  <div class="section-content">
    <div class="field-group">
      <div class="field-label">
        {m.data_visualized_label()}
        <InfoPopover text={m.data_visualized_info()} />
      </div>
      <ComboBox
        items={datasetItems}
        selectedId={datasetItems.find(
          (item) => item.datasetId === selectedDatasetId
        )?.id ?? 0}
        on:select={(e) => {
          const item = datasetItems.find((d) => d.id === e.detail.selectedId);
          if (item) selectedDatasetId = item.datasetId;
        }}
        placeholder={m.choose_data_field_placeholder()}
        labelText={m.data_visualized_label()}
        hideLabel
        size="sm"
      />
    </div>

    <div class="suggestions-section">
      <ExpandableSection
        title={m.section_suggestions()}
        open={suggestionsExpanded}
        onToggle={(expanded) => (suggestionsExpanded = expanded)}
        titleClass="suggestions-title"
      >
        {#snippet icon()}
          <span class="suggestions-title-icon">
            <MagicWandFilled size={20} />
          </span>
        {/snippet}

        <p class="suggestions-help">
          {m.use_suggestion_description()}
        </p>

        <div
          class="suggestions-group"
          role="radiogroup"
          aria-label={m.section_suggestions()}
        >
          {#each visibleSuggestions as suggestion (getSuggestionSignature(suggestion))}
            {@const isSelected =
              appliedSuggestionKey === getSuggestionSignature(suggestion)}
            <VisualizationSuggestionCard
              suggestion={suggestion}
              selected={isSelected}
              resolveBadgeType={getColumnBadgeType}
              activate={() => handleSelectSuggestion(suggestion)}
            />
          {/each}
        </div>

        {#if hasMoreSuggestions}
          <div class="suggestions-actions">
            <Button
              kind="tertiary"
              size="small"
              icon={MagicWandFilled}
              on:click={handleShowMore}
            >
              {m.show_other_suggestions()}
            </Button>
          </div>
        {/if}
      </ExpandableSection>
    </div>

    <div class="create-section">
      <Button
        size="field"
        icon={Edit}
        kind="secondary"
        on:click={handleCreateVisualization}
        style="width: 100%;"
      >
        {m.create_visualization_button()}
      </Button>
    </div>
  </div>
</section>

<style lang="scss">
  #choose-visualization {
    display: flex;
    flex-direction: column;
    padding: var(--kh-pad-panel) 0;
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
    padding: var(--kh-pad-panel) 0 0 0;
  }

  .suggestions-section {
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .suggestions-title-icon {
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
    display: flex;
    align-items: center;
  }

  .suggestions-help {
    color: var(--khartis-additions-text-helper-suggestions, #0072c3);
    margin: 0 0 var(--cds-spacing-05) 0;
    padding-right: 32px;
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .field-group {
    padding: 0 var(--kh-pad-panel);
    margin: 0;
  }

  .field-label {
    margin-bottom: var(--cds-spacing-03);
  }

  .suggestions-group {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
    margin: 0 0 var(--cds-spacing-05) 0;
    padding-right: 32px;
  }

  .suggestions-actions {
    display: flex;
    justify-content: center;
    margin-top: 0;
  }

  .create-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--kh-gap-param);
    margin: 0;
    padding: 0 var(--cds-spacing-05);
  }
</style>
