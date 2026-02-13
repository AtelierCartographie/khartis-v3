<script lang="ts">
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
    visualizationStore,
    VisualizationType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { isNumericType } from '$lib/features/commons/utils/format.utils';
  import type { ColumnAnalysis } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    Link,
    RadioButton
  } from 'carbon-components-svelte';
  import {
    ColorPalette,
    Edit,
    Launch,
    MagicWandFilled,
    Pin,
    CircleFilled,
    Shapes,
    EdgeNode
  } from 'carbon-icons-svelte';
  import { InfoPopover } from './components/shared';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { mapSuggestionToType } from './suggestion.utils';

  interface Props {
    onCreateVisualization?: () => void;
  }

  const { onCreateVisualization }: Props = $props();

  const SUGGESTIONS_PER_PAGE = 3;
  const MAX_SUGGESTIONS = 12;

  let selectedFieldId = $state<number>(0);
  let selectedSuggestion = $state<string | undefined>(undefined);
  let suggestionsExpanded = $state(true);
  let visibleCount = $state(SUGGESTIONS_PER_PAGE);

  const dataFieldItems = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== 'geometry')
      .map((col, id) => ({ id, text: col.name }));
  });

  const selectedFieldName = $derived.by(
    () => dataFieldItems.find((item) => item.id === selectedFieldId)?.text
  );

  const datasetColumns = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    return dataset?.columns || [];
  });

  const suggestions = $derived.by((): VizSuggestion[] => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];

    const columnAnalysis: ColumnAnalysis[] = dataset.columns.map((col) => ({
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

    const geometryType = (dataset.geometry?.type as GeometryType) || null;

    return vizSuggester.suggestVisualizations(columnAnalysis, geometryType, {
      maxSuggestions: MAX_SUGGESTIONS
    });
  });

  const filteredSuggestions = $derived.by(() => {
    const suggestionsList = suggestions;
    if (!selectedFieldName) {
      return suggestionsList;
    }

    const withSelectedField = suggestionsList.filter((suggestion) =>
      suggestion.columns?.includes(selectedFieldName)
    );

    return withSelectedField.length > 0 ? withSelectedField : suggestionsList;
  });

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
      case 'point':
        return CircleFilled;
      case 'polygon':
        return Shapes;
      case 'line':
        return EdgeNode;
      default:
        return CircleFilled;
    }
  }

  function getSemioTypeLabel(semioType: string): string {
    return semioType;
  }

  function handleShowMore() {
    visibleCount = Math.min(
      visibleCount + SUGGESTIONS_PER_PAGE,
      filteredSuggestions.length
    );
  }

  function handleSelectSuggestion(suggestion: VizSuggestion) {
    selectedSuggestion = suggestion.id;
  }

  function handleCreateVisualization() {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset) return;

    const suggestion = filteredSuggestions.find(
      (s) => s.id === selectedSuggestion
    );
    if (!suggestion) return;

    const vizType = mapSuggestionToType(suggestion.id);
    const viz = visualizationStore.createVisualization(vizType, dataset.id);

    if (suggestion.columns && suggestion.columns.length > 0) {
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

      visualizationStore.updateVisualization(viz.id, {
        mapping: { ...viz.mapping, ...mappingUpdate }
      });
    }

    suggestionsExpanded = false;
    onCreateVisualization?.();
  }

  export function collapseSuggestions() {
    suggestionsExpanded = false;
  }

  $effect(() => {
    const fields = dataFieldItems;
    if (!fields.length) {
      return;
    }

    const hasSelectedField = fields.some(
      (field) => field.id === selectedFieldId
    );
    if (!hasSelectedField) {
      selectedFieldId = fields[0].id;
    }
  });

  $effect(() => {
    void selectedFieldName;
    visibleCount = SUGGESTIONS_PER_PAGE;
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
        items={dataFieldItems}
        selectedId={selectedFieldId}
        on:select={(e) => (selectedFieldId = e.detail.selectedId)}
        placeholder={m.choose_data_field_placeholder()}
        labelText=""
        size="xl"
      />
    </div>

    <div class="suggestions-section">
      <ExpandableSection
        title={m.section_suggestions()}
        defaultOpen={suggestionsExpanded}
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
                <div class="preview-icon">
                  <ColorPalette size={32} />
                </div>
                <div class="preview-ratio">1:1</div>
                <div class="preview-label">Viz preview</div>
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
                  <h6 class="card-title">{suggestion.label}</h6>
                  <span class="radio-indicator">
                    <RadioButton checked={isSelected} />
                  </span>
                </div>

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

  .preview-icon {
    margin-bottom: var(--cds-spacing-02);
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
  }

  .preview-ratio {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.5rem;
  }

  .preview-label {
    font-size: 0.75rem;
    line-height: 1rem;
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
</style>
