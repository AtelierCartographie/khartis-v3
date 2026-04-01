<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/components/variable-badge.types';
  import {
    vizSuggester,
    type GeometryType,
    type VizSuggestion
  } from '$lib/features/commons/services/viz-suggester.service';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    PrimitiveFilterType,
    visualizationStore,
    VisualizationType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { isNumericType } from '$lib/features/commons/utils/format.utils';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, Link, Modal, RadioButton } from 'carbon-components-svelte';
  import {
    Edit,
    Launch,
    MagicWandFilled,
    Pin,
    CircleFilled,
    Shapes,
    EdgeNode,
    TrashCan,
    Copy
  } from 'carbon-icons-svelte';
  import SuggestionPreview from './components/suggestion-preview.svelte';
  import { InfoPopover } from './components/shared';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import {
    applySuggestionMapping,
    mapSuggestionToType,
    resolveDatasetGeometryType
  } from './suggestion.utils';
  import { UI_CONSTANTS } from '../constants';

  interface Props {
    onCreateVisualization?: () => void;
  }

  const { onCreateVisualization }: Props = $props();

  let selectedDatasetId = $state<string>(datasetsStore.selectedDatasetId ?? '');
  let selectedSuggestion = $state<string | undefined>(undefined);
  let suggestionsExpanded = $state(true);
  let visibleCount = $state<number>(UI_CONSTANTS.SUGGESTIONS_PER_PAGE);
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

    const columnAnalysis = dataset.columns.map((col) => ({
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

    const geometryType =
      resolveDatasetGeometryType(
        dataset as {
          id?: string;
          geometry?: { type?: string | null };
          sourceFileId?: string;
          joinedBasemap?: string;
          gpsMode?: boolean;
        }
      ) ||
      (dataset.geometry?.type as GeometryType) ||
      null;


    return vizSuggester.suggestVisualizations(columnAnalysis, geometryType, {
      maxSuggestions: UI_CONSTANTS.MAX_SUGGESTIONS
    });
  });

  const filteredSuggestions = $derived(suggestions);

  const visibleSuggestions = $derived(
    filteredSuggestions.slice(0, visibleCount)
  );
  const hasMoreSuggestions = $derived(
    visibleCount < filteredSuggestions.length
  );

  function getColumnBadgeType(columnName: string): VariableBadgeType {
    const col = datasetColumns.find((c) => c.name === columnName);
    if (!col) return 'string';
    const type = String(col.type || '').toLowerCase();
    if (isNumericType(type)) return 'numeric';
    if (type === 'date' || type === 'timestamp') return 'date';
    return 'string';
  }

  function getGeometryIcon(geometry: string) {
    switch (geometry) {
      case PrimitiveFilterType.POINT:
        return CircleFilled;
      case PrimitiveFilterType.POLYGON:
        return Shapes;
      case PrimitiveFilterType.LINE:
        return EdgeNode;
      default:
        return CircleFilled;
    }
  }

  function getSemioTypeLabel(semioType: string): string {
    const labels: Record<string, () => string> = {
      QTA: m.semio_label_QTA,
      QTR: m.semio_label_QTR,
      QL: m.semio_label_QL,
      QLO: m.semio_label_QLO
    };
    return labels[semioType]?.() ?? semioType;
  }

  function handleShowMore() {
    visibleCount = Math.min(
      visibleCount + UI_CONSTANTS.SUGGESTIONS_PER_PAGE,
      filteredSuggestions.length
    );
  }

  function handleSelectSuggestion(suggestion: VizSuggestion) {
    selectedSuggestion = suggestion.id;

    // Apply suggestion to the currently selected visualization
    const dataset = selectedDataset;
    if (!dataset) return;

    const existingVizs =
      visualizationStore.getVisualizationsByDataset(dataset.id);
    const selectedViz = visualizationStore.selectedVisualization;

    if (selectedViz && existingVizs.some((v) => v.id === selectedViz.id)) {
      const vizType = mapSuggestionToType(suggestion.id);
      visualizationStore.updateVisualization(selectedViz.id, { type: vizType });
      applySuggestionMapping(selectedViz.id, vizType, suggestion);
    }
  }

  function handleCreateVisualization() {
    const dataset = selectedDataset;
    if (!dataset) return;

    const currentSuggestion = selectedSuggestion
      ? filteredSuggestions.find((s) => s.id === selectedSuggestion)
      : undefined;

    const vizType = currentSuggestion
      ? mapSuggestionToType(currentSuggestion.id)
      : resolveDatasetGeometryType(
            dataset as {
              geometry?: { type?: string | null };
              sourceFileId?: string;
            }
          )
            ?.toLowerCase()
            .includes('point')
        ? VisualizationType.PROPORTIONAL
        : VisualizationType.CHOROPLETH;

    const viz = visualizationStore.createVisualization(vizType, dataset.id);

    if (currentSuggestion) {
      applySuggestionMapping(viz.id, vizType, currentSuggestion);
    }

    suggestionsExpanded = false;
    onCreateVisualization?.();
  }

  const datasetVisualizations = $derived.by(() => {
    if (!selectedDataset) return [];
    return visualizationStore.getVisualizationsByDataset(selectedDataset.id);
  });

  function handleSelectViz(id: string) {
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
      visualizationStore.updateVisualization(id, { name: trimmed });
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

  export function collapseSuggestions() {
    suggestionsExpanded = false;
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
    }
  });

  $effect(() => {
    const suggestionsList = filteredSuggestions;
    if (!suggestionsList.length) {
      selectedSuggestion = undefined;
      return;
    }

    const hasSelectedSuggestion = selectedSuggestion
      ? suggestionsList.some(
          (suggestion) => suggestion.id === selectedSuggestion
        )
      : false;

    if (!hasSelectedSuggestion) {
      selectedSuggestion = suggestionsList[0].id;
    }
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

        <div class="suggestions-group" role="list">
          {#each visibleSuggestions as suggestion (suggestion.id)}
            {@const isSelected = selectedSuggestion === suggestion.id}
            <button
              type="button"
              class="suggestion-card"
              class:selected={isSelected}
              onclick={() => handleSelectSuggestion(suggestion)}
              aria-pressed={isSelected}
            >
              <div class="card-preview">
                <SuggestionPreview
                  suggestionId={suggestion.id}
                  geometries={suggestion.geometries}
                />
                <div class="preview-primitives">
                  {#each suggestion.geometries as geometry (geometry)}
                    {@const GeomIcon = getGeometryIcon(geometry)}
                    <GeomIcon size={16} />
                  {/each}
                </div>
                {#if suggestion.semioTypes && suggestion.semioTypes.length > 0}
                  <div class="preview-semio">
                    {suggestion.semioTypes.map(getSemioTypeLabel).join(' + ')}
                  </div>
                {/if}
              </div>

              <div class="card-content">
                <div class="card-header">
                  <p class="card-title">{suggestion.label}</p>
                  <span class="radio-indicator">
                    <RadioButton checked={isSelected} />
                  </span>
                </div>

                {#if suggestion.score != null && suggestion.score > 0}
                  <div class="card-score">
                    {m.suggestion_score_label({ score: String(suggestion.score) })}
                  </div>
                {/if}

                <div class="card-variables">
                  {#if suggestion.columns && suggestion.columns.length > 0}
                    {#each suggestion.columns.slice(0, 2) as colName, idx (colName)}
                      {@const badgeType = getColumnBadgeType(colName)}
                      <div class="variable-row">
                        <span class="variable-arrow">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <path
                              d="M4 2V10H12"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </span>
                        <VariableBadge
                          label={colName.length > 10
                            ? colName.slice(0, 10) + '...'
                            : colName}
                          type={badgeType}
                        />
                        {#if suggestion.columns && suggestion.columns.length > 2 && idx === 0}
                          <span class="overflow-chip"
                            >+ {suggestion.columns.length - 1}</span
                          >
                        {/if}
                      </div>
                    {/each}
                  {:else}
                    <div class="variable-row empty">
                      <span class="no-variable">{m.no_variable()}</span>
                    </div>
                  {/if}
                </div>

                {#if suggestion.nbColumns > 2}
                  <div class="card-collection">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect
                        x="1"
                        y="1"
                        width="6"
                        height="6"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                      <rect
                        x="9"
                        y="1"
                        width="6"
                        height="6"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                      <rect
                        x="1"
                        y="9"
                        width="6"
                        height="6"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                      <rect
                        x="9"
                        y="9"
                        width="6"
                        height="6"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                    </svg>
                    <span>{m.map_collection()}</span>
                  </div>
                {/if}
              </div>
            </button>
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

<Modal
  danger
  open={isDeleteConfirmOpen}
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

  .suggestion-card {
    display: flex;
    border: 1px solid
      var(--khartis-additions-border-tile-01-suggestions, #82cfff);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    padding: 0;
    min-height: 120px;
    background: transparent;

    &:hover {
      border-color: var(--khartis-additions-interactive-suggestions, #0072c3);
    }

    &.selected {
      border: 2px solid var(--khartis-additions-focus-suggestions, #0072c3);
    }
  }

  .card-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 120px;
    padding: var(--cds-spacing-04);
    background: var(--khartis-additions-layer-02-suggestions, #ffffff);
    border-right: 1px solid
      var(--khartis-additions-border-tile-01-suggestions, #82cfff);
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
  }

  .preview-primitives {
    display: flex;
    gap: var(--cds-spacing-02);
    margin-top: var(--cds-spacing-02);
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
  }

  .preview-semio {
    font-size: 0.625rem;
    font-weight: 600;
    margin-top: var(--cds-spacing-01);
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .card-content {
    flex: 1;
    padding: var(--cds-spacing-04) var(--cds-spacing-04) var(--cds-spacing-04)
      var(--cds-spacing-05);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    background: var(--khartis-additions-layer-01-suggestions, #e5f6ff);
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
    transition: background 0.15s ease;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .radio-indicator {
    pointer-events: none;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .card-score {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--khartis-additions-text-helper-suggestions, #0072c3);
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .card-variables {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .variable-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    flex-wrap: wrap;

    &.empty {
      color: var(--khartis-additions-text-secondary-suggestions, #00539a);
      font-size: 0.75rem;
      opacity: 0.7;
    }
  }

  .variable-arrow {
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
    display: flex;
    align-items: center;
  }

  .overflow-chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 8px;
    border-radius: 1000px;
    background: var(--tag-background, #bae6ff);
    border: 1px solid var(--tag-border, #1192e8);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.75rem;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--tag-color, #00539a);
    white-space: nowrap;
  }

  .no-variable {
    font-style: italic;
  }

  .card-collection {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--khartis-additions-text-helper-suggestions, #0072c3);
    margin-top: var(--cds-spacing-02);
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
