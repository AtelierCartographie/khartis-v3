<script lang="ts">
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import Separator from '$lib/features/commons/components/separator.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    ComboBox,
    Grid,
    Row
  } from 'carbon-components-svelte';
  import { Add, MagicWand } from 'carbon-icons-svelte';

  interface Suggestion {
    id: string;
    title: string;
    subtitle?: string;
    tags: string[];
    ratio?: string;
  }

  // TODO hook to real data inputs when available
  const dataFields = ['sous-alimentation', 'Part sous-alim.', 'Population'];
  const dataFieldItems = dataFields.map((text, id) => ({ id, text }));
  let selectedFieldId = $state<number>(0);

  let suggestions = $state<Suggestion[]>([
    {
      id: 'symb1',
      title: 'Symboles proportionnels',
      tags: ['Sous-alim 2020'],
      ratio: '1:1'
    },
    {
      id: 'symb2',
      title: 'Symboles proportionnels',
      subtitle: 'colorés',
      tags: ['Sous-alim 2020', 'Part sous-alim.'],
      ratio: '1:1'
    },
    {
      id: 'symb3',
      title: 'Symboles proportionnels',
      tags: ['Sous-alim 2020', '+ 3'],
      ratio: '1:1'
    }
  ]);

  let selectedSuggestion = $state<string>('symb2');
</script>

<section>
  <header class="step-header">
    <h5>{m.step1_title()}</h5>
    <Separator orientation="horizontal" />
  </header>

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
              titleText=""
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
  .step-header {
    margin-bottom: var(--cds-spacing-05);

    h5 {
      margin-bottom: var(--cds-spacing-03);
      font-weight: 600;
    }
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
