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
  import { isNumericType } from '$lib/features/commons/utils/format.utils';
  import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
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
    if (isNumericType(type)) return 'numeric';
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
  <div class="section-content">
    <div class="header-section">
      <MainToolBarHeader title={m.step1_title()} icon={Pin} />
      <div class="divider"></div>
    </div>

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

    <div class="suggestions-section">
      <ExpandableSection
        title={m.section_suggestions()}
        defaultOpen={suggestionsExpanded}
        on:toggle={(e) => (suggestionsExpanded = e.detail.expanded)}
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
                      {@const colType = getColumnType(colName)}
                      <div class="variable-row">
                        <span class="variable-arrow">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <path
                              d="M3 8H13M13 8L9 4M13 8L9 12"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </span>
                        <div class="variable-chip">
                          <span class="chip-text"
                            >{colName.length > 15
                              ? colName.slice(0, 15) + '...'
                              : colName}</span
                          >
                          <span class="chip-divider"></span>
                          <span class="chip-icon">{getTypeLabel(colType)}</span>
                        </div>
                        {#if suggestion.columns && suggestion.columns.length > 2 && idx === 0}
                          <div class="variable-chip more">
                            <span class="chip-text"
                              >+ {suggestion.columns.length - 1}</span
                            >
                          </div>
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
    background: var(--cds-layer-01, #f4f4f4);
    padding: var(--cds-spacing-05);
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    background: var(--cds-background, #ffffff);
    padding: var(--cds-spacing-05) 0;
  }

  .header-section {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--cds-spacing-05));
    padding: 0 var(--cds-spacing-05);
  }

  .divider {
    width: calc(100% + 2 * var(--cds-spacing-05));
    height: 1px;
    background: var(--cds-border-subtle-00, #e0e0e0);
    margin: 0 calc(-1 * var(--cds-spacing-05));
  }

  .suggestions-section {
    border-top: 1px solid var(--cds-border-subtle-00, #e0e0e0);
    border-bottom: 1px solid var(--cds-border-subtle-00, #e0e0e0);
    margin: 0 calc(-1 * var(--cds-spacing-05));
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

  .variable-chip {
    display: flex;
    align-items: center;
    background: var(--tag-purple-tag-background, #e8daff);
    border: 1px solid var(--tag-purple-tag-border-operational, #be95ff);
    border-radius: 1000px;
    height: 18px;
    overflow: hidden;
    font-family: 'IBM Plex Mono', monospace;

    &.more {
      background: var(--tag-background, #bae6ff);
      border: 1px solid var(--tag-border, #1192e8);
      padding: 0 8px;
    }

    .chip-text {
      font-size: 0.75rem;
      color: var(--tag-purple-tag-color, #6929c4);
      padding: 0 6px 0 8px;
      line-height: 16px;
      letter-spacing: 0.32px;
    }

    &.more .chip-text {
      color: var(--tag-color, #00539a);
    }

    .chip-divider {
      width: 1px;
      height: 12px;
      background: var(--tag-purple-tag-border-operational, #be95ff);
    }

    .chip-icon {
      font-size: 0.75rem;
      color: var(--tag-purple-tag-color, #6929c4);
      padding: 0 6px;
      font-family: 'IBM Plex Sans', sans-serif;
      line-height: 16px;
      letter-spacing: 0.32px;
    }
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
