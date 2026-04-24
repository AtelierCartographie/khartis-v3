<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/components/variable-badge.types';
  import {
    vizSuggester,
    type GeometryType,
    type VizSuggestion
  } from '$lib/features/commons/services/viz-suggester.service';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    getVisualizationOriginMode,
    visualizationStore
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { isNumericType } from '$lib/features/commons/utils/format.utils';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, Link, Modal } from 'carbon-components-svelte';
  import {
    Edit,
    Launch,
    MagicWandFilled,
    Pin,
    TrashCan,
    Copy
  } from 'carbon-icons-svelte';
  import VisualizationSuggestionCard from './components/visualization-suggestion-card.svelte';
  import { InfoPopover } from './components/shared';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import {
    applyBlankVisualizationPreset,
    applySuggestionToVisualization,
    buildSuggestionOrigin,
    isVisualizationMatchingSuggestion,
    isVisualizationBlank,
    restoreVisualizationFromSuggestion,
    resolveBlankVisualizationType,
    resolveDatasetGeometryType
  } from './suggestion.service';
  import {
    getSuggestionSignature,
    resolveDisplayedSuggestionKey,
    resolveSuggestionCardAction,
    shouldAutoApplySuggestion
  } from './suggestion-selection';
  import { UI_CONSTANTS } from '../constants';
  import { appendToBody } from '$lib/features/commons/utils/append-to-body';

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
  let renamingVizId = $state<string | undefined>(undefined);
  let renameValue = $state<string>('');
  let deletingViz = $state<{ id: string; name: string } | null>(null);
  let isDeleteConfirmOpen = $state(false);

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

  const suggestions = $derived.by((): VizSuggestion[] => {
    // Track orchestrator version so suggestions re-evaluate after join completes
    void duckDBOrchestrator.datasetsVersion;

    const dataset = selectedDataset;
    if (!dataset?.columns) return [];
    const geoColumnsByName = new Map(
      (dataset.geoDetection?.geoColumns ?? []).map((column) => [
        column.columnName,
        column
      ])
    );

    const columnAnalysis = dataset.columns.map((col) => {
      const geoColumn = geoColumnsByName.get(col.name);

      return {
        ...(geoColumn
          ? {
              geo_type: geoColumn.type,
              geo_confidence: geoColumn.confidence
            }
          : {}),
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
      };
    });

    const geometryType =
      resolveDatasetGeometryType(
        dataset as {
          id?: string;
          geometry?: { type?: string | null };
          sourceFileId?: string;
          joinedBasemap?: string;
          gpsMode?: boolean;
          geoDetection?: {
            geoColumns?: Array<{ type?: string }>;
          };
        }
      ) ||
      (dataset.geometry?.type as GeometryType) ||
      null;

    return vizSuggester.suggestVisualizations(columnAnalysis, geometryType, {
      maxSuggestions: UI_CONSTANTS.SUGGESTIONS_PER_PAGE
    });
  });

  const visibleSuggestions = $derived(suggestions.slice(0, visibleCount));
  const hasMoreSuggestions = $derived(visibleCount < suggestions.length);

  function getColumnBadgeType(columnName: string): VariableBadgeType {
    const col = datasetColumns.find((c) => c.name === columnName);
    if (!col) return 'string';
    const type = String(col.type || '').toLowerCase();
    if (isNumericType(type)) return 'numeric';
    if (type === 'boolean') return 'boolean';
    if (type === 'date' || type === 'timestamp') return 'date';
    return 'string';
  }

  function handleShowMore() {
    visibleCount = Math.min(
      visibleCount + UI_CONSTANTS.SUGGESTIONS_PER_PAGE,
      suggestions.length
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

    return visualizationStore.getVisualizationsByDataset(dataset.id)[0];
  }

  function handleSelectSuggestion(suggestion: VizSuggestion) {
    const dataset = selectedDataset;
    const targetViz = getCurrentTargetVisualization();
    if (!dataset || !targetViz) return;

    const action = resolveSuggestionCardAction(
      appliedSuggestionKey,
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
      applyBlankVisualizationPreset(targetViz.id, dataset, {
        mode: 'manual-blank'
      });
    } else {
      const visualization = visualizationStore.createVisualization(
        resolveBlankVisualizationType(dataset),
        dataset.id
      );
      applyBlankVisualizationPreset(visualization.id, dataset, {
        mode: 'manual-blank'
      });
    }

    selectedSuggestionKey = undefined;
    suggestionsExpanded = suggestions.length > 0 || suggestionsExpanded;
    onCreateVisualization?.();
  }

  const datasetVisualizations = $derived.by(() => {
    void visualizationStore.version;

    if (!selectedDataset) return [];
    return visualizationStore.getVisualizationsByDataset(selectedDataset.id);
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
    const suggestionStillExists = suggestions.some(
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

  const targetVisualizationOriginMode = $derived(
    getVisualizationOriginMode(targetVisualization)
  );

  const autoSuggestionContextKey = $derived.by(() => {
    const targetViz = targetVisualization;

    if (!targetViz || suggestions.length === 0) {
      return undefined;
    }

    if (
      !shouldAutoApplySuggestion({
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

  function handleSelectViz(id: string) {
    selectedSuggestionKey = undefined;
    visualizationStore.selectVisualization(id);
  }

  function handleDuplicateViz(id: string) {
    visualizationStore.duplicateVisualization(id);
  }

  function handleDeleteViz(viz: { id: string; name: string }) {
    deletingViz = viz;
    isDeleteConfirmOpen = true;
  }

  function confirmDeleteViz() {
    if (deletingViz) {
      visualizationStore.removeVisualization(deletingViz.id);
    }
    isDeleteConfirmOpen = false;
    deletingViz = null;
  }

  function cancelDeleteViz() {
    isDeleteConfirmOpen = false;
    deletingViz = null;
  }

  function handleStartRename(viz: { id: string; name: string }) {
    renamingVizId = viz.id;
    renameValue = viz.name;
  }

  function handleConfirmRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      visualizationStore.renameVisualization(id, trimmed);
    }
    renamingVizId = undefined;
  }

  function handleRenameKeydown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      handleConfirmRename(id);
    } else if (e.key === 'Escape') {
      renamingVizId = undefined;
    }
  }

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

    const suggestionStillExists = suggestions.some(
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
        labelText=""
        size="xl"
      />
    </div>

    {#if datasetVisualizations.length > 0}
      <div class="viz-list" role="list">
        {#each datasetVisualizations as viz (viz.id)}
          {@const isSelected =
            visualizationStore.selectedVisualization?.id === viz.id}
          {@const isRenaming = renamingVizId === viz.id}
          <div class="viz-item" class:selected={isSelected} role="listitem">
            <button
              type="button"
              class="viz-item-select"
              onclick={() => handleSelectViz(viz.id)}
              aria-pressed={isSelected}
            >
              {#if isRenaming}
                <input
                  class="viz-rename-input"
                  type="text"
                  bind:value={renameValue}
                  onkeydown={(e: KeyboardEvent) =>
                    handleRenameKeydown(e, viz.id)}
                  onblur={() => handleConfirmRename(viz.id)}
                  onclick={(e: MouseEvent) => e.stopPropagation()}
                />
              {:else}
                <span class="viz-item-name">{viz.name}</span>
              {/if}
            </button>
            <div class="viz-item-actions">
              <IconButton
                kind="ghost"
                size="small"
                icon={Edit}
                iconDescription={m.viz_list_rename()}
                tooltipPosition="top"
                on:click={() => handleStartRename(viz)}
              />
              <IconButton
                kind="ghost"
                size="small"
                icon={Copy}
                iconDescription={m.viz_list_duplicate()}
                tooltipPosition="top"
                on:click={() => handleDuplicateViz(viz.id)}
              />
              <IconButton
                kind="ghost"
                size="small"
                icon={TrashCan}
                iconDescription={m.viz_list_delete()}
                tooltipPosition="top"
                on:click={() => handleDeleteViz(viz)}
              />
            </div>
          </div>
        {/each}
      </div>
    {/if}

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
        icon={Edit}
        kind="secondary"
        on:click={handleCreateVisualization}
        style="width: 100%;"
      >
        {m.create_visualization_button()}
      </Button>

      <div class="learn-more">
        <Link href="#" size="sm">{m.learn_more_visualizations()}</Link>
        <Launch size={16} />
      </div>
    </div>
  </div>
</section>

{#if isDeleteConfirmOpen}
  <div use:appendToBody>
    <Modal
      danger
      bind:open={isDeleteConfirmOpen}
      modalHeading={m.viz_list_delete_title()}
      primaryButtonText={m.delete_confirm_button()}
      secondaryButtonText={m.cancel()}
      size="sm"
      on:click:button--secondary={cancelDeleteViz}
      on:click:button--primary={confirmDeleteViz}
      on:close={cancelDeleteViz}
    >
      <p>
        {m.viz_list_delete_message({ name: deletingViz?.name ?? '' })}
      </p>
    </Modal>
  </div>
{/if}

<style lang="scss">
  #choose-visualization {
    display: flex;
    flex-direction: column;
    padding: 16px 0;
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
    padding: 16px 0 0 0;
  }

  .suggestions-section {
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .suggestions-title-icon {
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
    display: flex;
    align-items: center;
  }

  :global(.suggestions-title) {
    color: var(
      --khartis-additions-text-primary-suggestions,
      #003a6d
    ) !important;
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
    padding: 0 var(--cds-spacing-05);
    margin: 0;
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    margin-bottom: var(--cds-spacing-03);
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    font-weight: 400;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .suggestions-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
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
    gap: var(--cds-spacing-04);
    margin: 0;
    padding: 0 var(--cds-spacing-05);
  }

  .learn-more {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .learn-more :global(a) {
    color: var(--cds-text-secondary, #525252);
  }

  .learn-more :global(svg) {
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
  }

  .viz-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    padding: 0 var(--cds-spacing-05);
  }

  .viz-item {
    display: flex;
    align-items: center;
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background: var(--cds-layer-01, #f4f4f4);
    min-height: 40px;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong-01, #8d8d8d);

      .viz-item-actions {
        opacity: 1;
      }
    }

    &.selected {
      border-color: var(--cds-border-interactive, #726e6e);
      background: var(--cds-layer-selected-01, #e8e8e8);
    }
  }

  .viz-item-select {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 0 var(--cds-spacing-04);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    min-height: 40px;
    overflow: hidden;
  }

  .viz-item-name {
    font-size: 0.875rem;
    color: var(--cds-text-primary, #161616);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .viz-rename-input {
    width: 100%;
    border: none;
    border-bottom: 2px solid var(--cds-border-interactive, #726e6e);
    background: transparent;
    font-size: 0.875rem;
    color: var(--cds-text-primary, #161616);
    outline: none;
    padding: 0;
  }

  .viz-item-actions {
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s ease;
    flex-shrink: 0;
  }
</style>
