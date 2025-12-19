<script lang="ts">
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import {
    vizSuggester,
    type GeometryType
  } from '$lib/features/commons/services/viz-suggester.service';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import type { ColumnAnalysis } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    ComboBox,
    Grid,
    Row
  } from 'carbon-components-svelte';
  import { Add, MagicWand } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  interface Suggestion {
    id: string;
    title: string;
    subtitle?: string;
    tags: string[];
    ratio?: string;
  }

  let selectedFieldId = $state<number>(0);
  let selectedSuggestion = $state<string | undefined>(undefined);

  const dataFieldItems = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== 'geometry')
      .map((col, id) => ({ id, text: col.name }));
  });

  const suggestions = $derived.by((): Suggestion[] => {
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

    const vizSuggestions = vizSuggester.suggestVisualizations(
      columnAnalysis,
      geometryType,
      { maxSuggestions: 5 }
    );

    return vizSuggestions.map((viz) => ({
      id: viz.id,
      title: viz.label,
      tags: viz.columns || [],
      ratio: viz.nbColumns > 0 ? `${viz.nbColumns}:1` : undefined
    }));
  });

  $effect(() => {
    if (suggestions.length > 0 && !selectedSuggestion) {
      selectedSuggestion = suggestions[0].id;
    }
  });
</script>

<section id="choose-visualization">
  <MainToolBarHeader title={m.step1_title()} />

  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <div class="sub-section">
          <h6>{m.create_visualization_title()}</h6>
          <p class="kh-help">
            {m.create_visualization_description()}
          </p>
          <Button kind="primary" icon={Add} size="field">
            {m.new_visualization_button()}
          </Button>
        </div>

        <div class="sub-section">
          <h6>{m.use_suggestion_title()}</h6>
          <p class="kh-help">
            {m.use_suggestion_description()}
          </p>

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

          <div class="suggestions-group" role="list">
            {#each suggestions as s (s.id)}
              <ProjectionCard
                title={s.title}
                subtitle={s.subtitle}
                tag={s.tags?.[0]}
                ratio={s.ratio}
                selected={selectedSuggestion === s.id}
                onclick={() => (selectedSuggestion = s.id)}
                layout="horizontal"
              />
            {/each}
          </div>

          <div class="suggestions-actions">
            <Button kind="tertiary" size="small" icon={MagicWand}>
              {m.show_other_suggestions()}
            </Button>
          </div>
        </div>
      </Column>
    </Row>
  </Grid>
</section>

<style lang="scss">
  #choose-visualization {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .sub-section {
    h6 {
      margin-bottom: var(--cds-spacing-03);
      font-weight: 600;
      font-size: 1rem;
    }
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
    line-height: 1.4;
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
    display: grid;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-05);
  }

  .suggestions-actions {
    display: flex;
    justify-content: center;
  }
</style>
