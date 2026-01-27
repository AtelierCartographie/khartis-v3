<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
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
  import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import type { ColumnAnalysis } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    Link,
    RadioButton,
    Tag
  } from 'carbon-components-svelte';
  import { ColorPalette, Edit, MagicWand } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

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

  const datasetColumns = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    return dataset?.columns || [];
  });

  const allSuggestions = $derived.by((): VizSuggestion[] => {
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
        mean: col.stats?.mean
      }
    }));

    const geometryType = (dataset.geometry?.type as GeometryType) || null;

    return vizSuggester.suggestVisualizations(columnAnalysis, geometryType, {
      maxSuggestions: MAX_SUGGESTIONS
    });
  });

  const visibleSuggestions = $derived(allSuggestions.slice(0, visibleCount));
  const hasMoreSuggestions = $derived(visibleCount < allSuggestions.length);

  function getColumnType(columnName: string): 'numeric' | 'text' | 'date' {
    const col = datasetColumns.find((c) => c.name === columnName);
    if (!col) return 'text';
    const type = String(col.type || '').toLowerCase();
    if (
      type === 'number' ||
      type === 'numeric' ||
      type === 'integer' ||
      type === 'bigint'
    )
      return 'numeric';
    if (type === 'date' || type === 'timestamp') return 'date';
    return 'text';
  }

  function getTypeLabel(type: 'numeric' | 'text' | 'date'): string {
    switch (type) {
      case 'numeric':
        return '123';
      case 'date':
        return 'Date';
      default:
        return 'ABC';
    }
  }

  function handleShowMore() {
    visibleCount = Math.min(
      visibleCount + SUGGESTIONS_PER_PAGE,
      allSuggestions.length
    );
  }

  function handleSelectSuggestion(suggestion: VizSuggestion) {
    selectedSuggestion = suggestion.id;
  }

  function mapSuggestionToType(suggestionId: string): VisualizationType {
    const mapping: Record<string, VisualizationType> = {
      // 0-column suggestions (basic geometries)
      symbols_uniques: VisualizationType.PROPORTIONAL,
      polygons_uniques: VisualizationType.CHOROPLETH,
      lines_uniques: VisualizationType.CHOROPLETH,

      // QTR (quantitative ratio) → CHOROPLETH
      choropleth: VisualizationType.CHOROPLETH,
      symbols_uniques_colorful_QTR: VisualizationType.CHOROPLETH,
      lines_colorful_QTR: VisualizationType.CHOROPLETH,

      // QTA (quantitative absolute) → PROPORTIONAL
      symbols_proportional: VisualizationType.PROPORTIONAL,
      lines_proportional: VisualizationType.PROPORTIONAL,

      // QL (qualitative) → CATEGORICAL
      polygons_colorful_QL: VisualizationType.CATEGORICAL,
      symbols_differents: VisualizationType.CATEGORICAL,
      symbols_uniques_colorful_QL: VisualizationType.CATEGORICAL,
      lines_colorful_QL: VisualizationType.CATEGORICAL,

      // QLO (qualitative ordered) → CATEGORICAL
      polygons_colorful_QLO: VisualizationType.CATEGORICAL,
      symbols_differents_QLO: VisualizationType.CATEGORICAL,
      symbols_uniques_colorful_QLO: VisualizationType.CATEGORICAL,
      lines_colorful_QLO: VisualizationType.CATEGORICAL,

      // 2-column combinations → BIVARIATE
      symbols_proportional_colorful_QL: VisualizationType.BIVARIATE,
      symbols_proportional_colorful_QTR: VisualizationType.BIVARIATE,
      symbols_proportional_double: VisualizationType.BIVARIATE,
      lines_proportional_colorful_QL: VisualizationType.BIVARIATE,
      lines_proportional_colorful_QTR: VisualizationType.BIVARIATE
    };

    return mapping[suggestionId] ?? VisualizationType.CHOROPLETH;
  }

  function handleCreateVisualization() {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset) return;

    const suggestion = allSuggestions.find((s) => s.id === selectedSuggestion);
    if (!suggestion) return;

    const vizType = mapSuggestionToType(suggestion.id);
    const viz = visualizationStore.createVisualization(
      vizType,
      dataset.id,
      suggestion.label
    );

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

    legendActions.addLegendItem({
      name: viz.name,
      visible: true,
      title: viz.name,
      subtitle: suggestion.columns?.[0] ?? '',
      note: '',
      variableId: viz.id
    });

    suggestionsExpanded = false;
    onCreateVisualization?.();
  }

  export function collapseSuggestions() {
    suggestionsExpanded = false;
  }

  $effect(() => {
    if (allSuggestions.length > 0 && !selectedSuggestion) {
      selectedSuggestion = allSuggestions[0].id;
    }
  });
</script>

<section id="choose-visualization">
  <MainToolBarHeader title={m.step1_title()} />

  <div class="field-group">
    <div class="field-label">{m.data_visualized_label()}</div>
    <ComboBox
      items={dataFieldItems}
      selectedId={selectedFieldId}
      on:select={(e) => (selectedFieldId = e.detail.selectedId)}
      placeholder={m.choose_data_field_placeholder()}
      labelText=""
      size="xl"
    />
  </div>

  <ExpandableSection
    title={m.section_suggestions()}
    defaultOpen={suggestionsExpanded}
    on:toggle={(e) => (suggestionsExpanded = e.detail.expanded)}
  >
    {#snippet icon()}
      <ColorPalette size={20} />
    {/snippet}

    <p class="kh-help suggestions-help">
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
            {#if suggestion.score != null}
              <span class="preview-score">{suggestion.score}%</span>
            {/if}
            <span class="preview-ratio"
              >{suggestion.nbColumns > 0
                ? `${suggestion.nbColumns}:1`
                : '1:1'}</span
            >
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
                  {@const colType = getColumnType(colName)}
                  <div class="variable-row">
                    <span class="variable-arrow">↳</span>
                    <Tag size="sm" type="purple">
                      {colName.length > 12
                        ? colName.slice(0, 12) + '...'
                        : colName}
                    </Tag>
                    <Tag size="sm" type="purple">{getTypeLabel(colType)}</Tag>
                    {#if suggestion.columns && suggestion.columns.length > 2 && idx === 0}
                      <Tag size="sm" type="purple"
                        >+ {suggestion.columns.length - 1}</Tag
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
                <ColorPalette size={16} />
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
          icon={MagicWand}
          on:click={handleShowMore}
        >
          {m.show_other_suggestions()}
        </Button>
      </div>
    {/if}
  </ExpandableSection>

  <div class="create-section">
    <Button
      kind="primary"
      size="lg"
      icon={Edit}
      on:click={handleCreateVisualization}
    >
      {m.create_visualization_button()}
    </Button>

    <div class="learn-more">
      <Link href="#" size="sm">{m.learn_more_visualizations()}</Link>
    </div>
  </div>
</section>

<style lang="scss">
  #choose-visualization {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .suggestions-help {
    margin-top: var(--cds-spacing-03);
  }

  .field-group {
    margin-bottom: var(--cds-spacing-05);
  }

  .field-label {
    margin-bottom: var(--cds-spacing-03);
    font-size: 0.875rem;
    color: var(--cds-text-02);
    font-weight: 600;
  }

  .suggestions-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-05);
  }

  .suggestion-card {
    display: flex;
    border: 1px solid var(--cds-border-subtle);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    padding: 0;
    min-height: 120px;

    &:hover .card-content {
      background: var(--cds-medium-blue);
    }

    &.selected {
      border: 2px solid var(--cds-interactive);
    }
  }

  .card-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 100px;
    padding: var(--cds-spacing-04);
    background: var(--cds-ui-02);
    border-right: 1px solid var(--cds-border-subtle);
    color: var(--cds-blue);
  }

  .preview-icon {
    margin-bottom: var(--cds-spacing-02);
  }

  .preview-score {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-support-success, #198038);
    background: var(--cds-support-success-inverse, #defbe6);
    padding: 1px 6px;
    border-radius: 10px;
    margin-bottom: var(--cds-spacing-02);
  }

  .preview-ratio {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .card-content {
    flex: 1;
    padding: var(--cds-spacing-04);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    background: var(--cds-pale-blue);
    color: var(--cds-blue);
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
    color: var(--cds-blue);
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
      color: var(--cds-blue);
      font-size: 0.75rem;
      opacity: 0.7;
    }
  }

  .variable-arrow {
    color: var(--cds-blue);
    font-size: 0.75rem;
  }

  .no-variable {
    font-style: italic;
  }

  .card-collection {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-blue);
    margin-top: var(--cds-spacing-02);
  }

  .suggestions-actions {
    display: flex;
    justify-content: center;
  }

  .create-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-05);
  }

  .learn-more {
    display: inline-flex;
  }
</style>
