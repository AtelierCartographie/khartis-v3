<script lang="ts">
  import Switch from '$lib/features/commons/components/switch.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
    Row,
    MultiSelect,
    RadioButtonGroup,
    RadioButton
  } from 'carbon-components-svelte';
  import { Launch } from 'carbon-icons-svelte';
  import { SCALE_MODE, facetsStore } from './facets.store.svelte';
  import {
    VisualizationType,
    visualizationStore
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

  const selectedViz = $derived(visualizationStore.selectedVisualization);
  const enabled = $derived(facetsStore.enabled);
  const layout = $derived(facetsStore.layout);
  const scaleMode = $derived(facetsStore.scaleMode);

  const dataset = $derived(
    selectedViz
      ? datasetsStore.datasets.find((d) => d.id === selectedViz.datasetId)
      : null
  );

  const numericColumns = $derived(
    dataset
      ? dataset.columns
          .filter((col) => col.type === 'number')
          .map((col) => ({
            id: col.name,
            text: col.name
          }))
      : []
  );

  let selectedVarIds = $state<string[]>([]);

  const canGenerate = $derived(
    selectedViz &&
      selectedVarIds.length >= 2 &&
      (selectedViz.type === VisualizationType.CHOROPLETH ||
        selectedViz.type === VisualizationType.PROPORTIONAL)
  );

  const showWarning = $derived(selectedVarIds.length > 9);

  const FACETS_HELP_URL =
    'https://cartographie.sciencespo.fr/khartis/help/facets';

  function handleLearnMore() {
    window.open(FACETS_HELP_URL, '_blank');
  }

  async function handleGenerate() {
    if (!selectedViz || !canGenerate) return;

    await facetsStore.enable(selectedViz.id, selectedVarIds);
  }

  function handleExit() {
    facetsStore.disable();
    selectedVarIds = [];
  }

  async function handleToggleScale() {
    await facetsStore.toggleScaleMode();
  }

  function handleScaleModeChange(checked: boolean): void {
    const isShared = scaleMode === SCALE_MODE.SHARED;
    if (checked !== isShared) {
      void handleToggleScale();
    }
  }

  function handleColumnsChange(value: string | number) {
    const columns = Number(value) as 2 | 3 | 4;
    facetsStore.setColumns(columns);
  }
</script>

<div id="khartis-facets-tool">
  <Grid noGutter fullWidth>
    {#if enabled}
      <Row>
        <Column>
          <p class="description">{m.facets_active_description()}</p>
        </Column>
      </Row>

      <Row padding>
        <Column>
          <Button
            kind="danger-tertiary"
            style="width: 100%;"
            onclick={handleExit}
          >
            {m.facets_exit_mode()}
          </Button>
        </Column>
      </Row>

      <Row padding>
        <Column>
          <div class="layout-control">
            <label class="bx--label" for="facets-columns">
              {m.facets_columns_label()}
            </label>
            <RadioButtonGroup
              orientation="horizontal"
              selected={String(layout.columns)}
              on:change={(e) => handleColumnsChange(e.detail)}
            >
              <RadioButton value="2" labelText="2 {m.facets_columns()}" />
              <RadioButton value="3" labelText="3 {m.facets_columns()}" />
              <RadioButton value="4" labelText="4 {m.facets_columns()}" />
            </RadioButtonGroup>
          </div>
        </Column>
      </Row>

      <Row padding>
        <Column>
          <Switch
            toggled={scaleMode === SCALE_MODE.SHARED}
            labelText={m.facets_shared_scale()}
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={handleScaleModeChange}
          />
        </Column>
      </Row>
    {:else}
      <Row>
        <Column>
          <p class="description">{m.facets_description()}</p>
        </Column>
      </Row>

      {#if !selectedViz}
        <Row padding>
          <Column>
            <p class="hint">{m.facets_select_viz_first()}</p>
          </Column>
        </Row>
      {:else if selectedViz.type !== VisualizationType.CHOROPLETH && selectedViz.type !== VisualizationType.PROPORTIONAL}
        <Row padding>
          <Column>
            <p class="hint">{m.facets_unsupported_type()}</p>
          </Column>
        </Row>
      {:else}
        <Row padding>
          <Column>
            <MultiSelect
              label={m.facets_select_variables()}
              items={numericColumns}
              bind:selectedIds={selectedVarIds}
            />
          </Column>
        </Row>

        {#if selectedVarIds.length > 0 && selectedVarIds.length < 2}
          <Row padding>
            <Column>
              <p class="warning">{m.facets_min_variables_warning()}</p>
            </Column>
          </Row>
        {/if}

        {#if showWarning}
          <Row padding>
            <Column>
              <p class="warning">{m.facets_performance_warning()}</p>
            </Column>
          </Row>
        {/if}

        <Row padding>
          <Column>
            <div class="layout-control">
              <label class="bx--label" for="facets-columns">
                {m.facets_columns_label()}
              </label>
              <RadioButtonGroup
                orientation="horizontal"
                selected={String(layout.columns)}
                on:change={(e) => handleColumnsChange(e.detail)}
              >
                <RadioButton value="2" labelText="2 {m.facets_columns()}" />
                <RadioButton value="3" labelText="3 {m.facets_columns()}" />
                <RadioButton value="4" labelText="4 {m.facets_columns()}" />
              </RadioButtonGroup>
            </div>
          </Column>
        </Row>

        <Row padding>
          <Column>
            <Switch
              toggled={scaleMode === SCALE_MODE.SHARED}
              labelText={m.facets_shared_scale()}
              labelA={m.no()}
              labelB={m.yes()}
              showStateLabel
              onchange={handleScaleModeChange}
            />
          </Column>
        </Row>

        <Row padding>
          <Column>
            <Button
              kind="primary"
              style="width: 100%;"
              disabled={!canGenerate}
              onclick={handleGenerate}
            >
              {m.facets_generate()}
            </Button>
          </Column>
        </Row>
      {/if}

      <Row padding>
        <Column>
          <Button kind="ghost" icon={Launch} onclick={handleLearnMore}>
            {m.facets_learn_more()}
          </Button>
        </Column>
      </Row>
    {/if}
  </Grid>
</div>

<style>
  .description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-03);
    line-height: 1.4;
  }

  .hint {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-style: italic;
  }

  .warning {
    font-size: 0.8125rem;
    color: var(--cds-support-warning);
  }

  .layout-control {
    margin-bottom: var(--cds-spacing-05);
  }

  .layout-control :global(.bx--radio-button-group) {
    margin-top: var(--cds-spacing-03);
  }
</style>
