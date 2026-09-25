<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { DOC_LINK } from '$lib/features/commons/constants/doc-links.constants';
  import { Button, Link, TextInput } from 'carbon-components-svelte';
  import {
    CharacterWholeNumber,
    Draggable,
    Launch,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { dragHandle, dragHandleZone } from 'svelte-dnd-action';
  import { tick, untrack } from 'svelte';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';
  import { sanitizeTextInput } from '$lib/features/commons/utils/sanitize.utils';
  import { facetsStore, FACETS_FRAME_THICKNESS } from './facets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { isAutoFacetNumericColumn } from '$lib/features/commons/utils/visualization-columns.utils';
  import SliderWithInput from '$lib/features/commons/components/viz-controls/visualization-slider-with-input.svelte';
  import ToggleWithLabel from '$lib/features/commons/components/viz-controls/toggle-with-label.svelte';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';

  const CONFIGURE_SECTION_ID = 'configure-visualization';
  const FACET_TITLE_INPUT_ID_PREFIX = 'facet-title-';
  const MOBILE_CONFIGURE_TAB_SELECTOR = '[data-viz-sub-tab="configure"]';
  const FACETS_COLUMNS_MIN = 1;
  const FLIP_DURATION_MS = 200;

  interface OrderedVariable {
    id: string;
  }

  const enabled = $derived(facetsStore.enabled);
  const layout = $derived(facetsStore.layout);
  const variables = $derived(facetsStore.variables);
  const facetVisualizations = $derived(facetsStore.facetVisualizations);

  const columnsMax = $derived(
    Math.max(FACETS_COLUMNS_MIN, facetVisualizations.length)
  );
  const columnsValue = $derived(Math.min(layout.columns, columnsMax));

  const baseVisualization = $derived.by(() => {
    const baseId = facetsStore.baseVisualizationId;
    if (!baseId) return undefined;
    return visualizationStore.visualizations.find((v) => v.id === baseId);
  });

  const numericDataFields = $derived.by(() => {
    const baseDatasetId = baseVisualization?.datasetId;
    if (!baseDatasetId) return [] as string[];
    const dataset = datasetsStore.datasets.find((d) => d.id === baseDatasetId);
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter(isAutoFacetNumericColumn)
      .map((col) => col.name);
  });

  let orderedVariables = $state<OrderedVariable[]>([]);
  let dragging = $state(false);

  $effect(() => {
    const nextVariables = variables;
    if (!untrack(() => dragging)) {
      orderedVariables = nextVariables.map((variable) => ({ id: variable }));
    }
  });

  function handleOrderConsider(event: Event) {
    dragging = true;
    orderedVariables = (event as CustomEvent).detail.items;
  }

  function handleOrderFinalize(event: Event) {
    const { items, info } = (event as CustomEvent).detail;
    orderedVariables = items;
    dragging = false;

    const fromIndex = variables.indexOf(info.id);
    const toIndex = (items as OrderedVariable[]).findIndex(
      (item) => item.id === info.id
    );

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      void facetsStore.reorderVariables(fromIndex, toIndex);
    }
  }

  function handleConfigureVisualization() {
    globalActions.setSelectedTool(undefined);
    globalActions.setNavigationState(ToolbarStep.Visualizations);
    if (globalState.isMobileView) {
      globalActions.openMobileToolbar();
    }

    setTimeout(() => {
      if (globalState.isMobileView) {
        document
          .querySelector<HTMLButtonElement>(MOBILE_CONFIGURE_TAB_SELECTOR)
          ?.click();
      }

      requestAnimationFrame(() => {
        document
          .querySelector(`#${CONFIGURE_SECTION_ID}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }, 100);
  }

  function handleColumnsChange(value: number) {
    facetsStore.setColumns(value);
  }

  function resolveFacetTitle(variable: string): string {
    return facetsStore.getFacetTitle(variable) ?? variable;
  }

  function handleFacetTitleInput(variable: string, event: CarbonValueEvent) {
    facetsStore.setFacetTitle(
      variable,
      sanitizeTextInput(readCarbonStringValue(event), { trim: false })
    );
  }

  // A title clicked on the page hands the panel the field to focus.
  $effect(() => {
    const variable = facetsStore.editedTitleVariable;
    if (!variable) {
      return;
    }

    void tick().then(() => {
      document
        .getElementById(`${FACET_TITLE_INPUT_ID_PREFIX}${variable}`)
        ?.focus();
      facetsStore.editFacetTitle(null);
    });
  });

  const isActive = $derived(enabled && facetVisualizations.length > 0);
</script>

<div
  id="khartis-facets-tool"
  class="facets-tool"
  class:facets-tool--active={isActive}
>
  {#if isActive}
    <section class="section">
      <header class="section-heading">
        <span class="section-title">{m.facets_display_section()}</span>
        <span class="section-divider" aria-hidden="true"></span>
      </header>
      <p class="helper-text">{m.facets_display_helper()}</p>
      <SliderWithInput
        label={m.facets_columns_label()}
        value={columnsValue}
        min={FACETS_COLUMNS_MIN}
        max={columnsMax}
        step={1}
        showMinMax
        onchange={handleColumnsChange}
      />
      <ToggleWithLabel
        label={m.facets_frame_visible_label()}
        toggled={layout.frameVisible}
        ontoggle={(value) => facetsStore.setFrameVisible(value)}
      />
      <SingleColorPreview
        label={m.color()}
        color={layout.frameColor}
        allowPattern={false}
        onchange={(hex) => facetsStore.setFrameColor(hex)}
      />
      <SliderWithInput
        label={m.thickness()}
        value={layout.frameThickness}
        min={FACETS_FRAME_THICKNESS.min}
        max={FACETS_FRAME_THICKNESS.max}
        step={FACETS_FRAME_THICKNESS.step}
        onchange={(value) => facetsStore.setFrameThickness(value)}
      />
    </section>

    <section class="section">
      <header class="section-heading">
        <span class="section-title">{m.facets_distribution_section()}</span>
        <span class="section-divider" aria-hidden="true"></span>
      </header>
      <p class="helper-text">{m.facets_distribution_helper()}</p>

      <div
        class="order-list"
        role="list"
        aria-label={m.facets_distribution_section()}
        use:dragHandleZone={{
          items: orderedVariables,
          flipDurationMs: FLIP_DURATION_MS,
          type: 'facet-variables',
          dropTargetStyle: {},
          useCursorForDetection: true
        }}
        onconsider={handleOrderConsider}
        onfinalize={handleOrderFinalize}
      >
        {#each orderedVariables as variable, index (variable.id)}
          <div class="order-row" role="listitem">
            <div
              class="drag-handle"
              use:dragHandle
              aria-label={`${m.facets_reorder()} ${variable.id}`}
            >
              <Draggable size={16} />
            </div>
            <span class="order-position">{index + 1}</span>
            <span class="variable-tag">
              <span class="variable-tag-text">{variable.id}</span>
              {#if numericDataFields.includes(variable.id)}
                <span class="variable-tag-icon">
                  <CharacterWholeNumber size={16} />
                </span>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </section>

    <section class="section">
      <header class="section-heading">
        <span class="section-title">{m.facets_titles_section()}</span>
        <span class="section-divider" aria-hidden="true"></span>
      </header>
      <p class="helper-text">{m.facets_titles_helper()}</p>

      {#each variables as variable (variable)}
        <TextInput
          size="sm"
          id={`${FACET_TITLE_INPUT_ID_PREFIX}${variable}`}
          labelText={m.facets_facet_title_label({ variable })}
          placeholder={variable}
          value={resolveFacetTitle(variable)}
          on:input={(event: CarbonValueEvent) =>
            handleFacetTitleInput(variable, event)}
        />
      {/each}
    </section>

    <Link
      href={DOC_LINK.MAP_COLLECTIONS}
      target="_blank"
      size="sm"
      icon={Launch}
    >
      {m.facets_learn_more()}
    </Link>
  {:else}
    <p class="helper-text">{m.facets_collection_description()}</p>
    <p class="helper-text">{m.facets_create_instruction()}</p>

    <Link
      href={DOC_LINK.MAP_COLLECTIONS}
      target="_blank"
      size="sm"
      icon={Launch}
    >
      {m.facets_learn_more()}
    </Link>

    <Button
      size="field"
      kind="secondary"
      icon={SettingsAdjust}
      style="width: 100%;"
      onclick={handleConfigureVisualization}
    >
      {m.facets_configure_visualization()}
    </Button>
  {/if}
</div>

<style lang="scss">
  .facets-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
  }

  .facets-tool--active {
    gap: var(--cds-spacing-07, 32px);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    height: 24px;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
    line-height: 18px;
    letter-spacing: 0.16px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .section-divider {
    flex: 1;
    height: 1px;
    background-color: var(--cds-border-subtle-01, #c6c6c6);
  }

  .helper-text {
    font-size: 0.75rem;
    color: var(--cds-text-helper, #6f6f6f);
    line-height: 1rem;
    letter-spacing: 0.32px;
    margin: 0;
  }

  .order-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    outline: none;
  }

  .order-list :global([aria-grabbed='true']) {
    opacity: 0.4;
  }

  .order-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    min-height: var(--kh-size-md);
    padding: 0 var(--cds-spacing-03, 8px);
    background-color: var(--cds-layer-01, #f4f4f4);
    border: 1px solid var(--cds-border-tile-01, #c6c6c6);
    cursor: grab;
  }

  .order-row:hover {
    background-color: var(--cds-layer-hover, #e8e8e8);
  }

  .drag-handle {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--cds-icon-secondary, #525252);
  }

  .order-position {
    flex-shrink: 0;
    min-width: 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
    line-height: 18px;
    letter-spacing: 0.16px;
    text-align: center;
  }

  .variable-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02, 4px);
    flex: 1;
    min-width: 0;
    min-height: 18px;
    background-color: var(--cds-tag-background-purple, #e8daff);
    border: 1px solid var(--cds-tag-border-purple, #be95ff);
    border-radius: 1000px;
    overflow: hidden;
  }

  .variable-tag-text {
    flex: 1;
    min-width: 0;
    padding: 0 6px 2px 8px;
    font-size: 0.75rem;
    color: var(--cds-tag-color-purple, #6929c4);
    line-height: 1rem;
    letter-spacing: 0.32px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .variable-tag-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0 var(--cds-spacing-02, 4px) 0 var(--cds-spacing-01, 2px);
    color: var(--cds-tag-color-purple, #6929c4);
    border-left: 1px solid var(--cds-tag-border-purple, #be95ff);
    align-self: stretch;
  }
</style>
