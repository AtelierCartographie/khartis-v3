<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    Button,
    MultiSelect,
    Slider,
    Toggle
  } from 'carbon-components-svelte';
  import {
    ArrowDown,
    ArrowUp,
    Draggable,
    Launch,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { dndzone } from 'svelte-dnd-action';
  import { facetsStore, SCALE_MODE } from './facets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';

  const selectedViz = $derived(visualizationStore.selectedVisualization);
  const enabled = $derived(facetsStore.enabled);
  const layout = $derived(facetsStore.layout);
  const variables = $derived(facetsStore.variables);
  const facetVisualizations = $derived(facetsStore.facetVisualizations);
  const syncPanZoom = $derived(facetsStore.syncPanZoom);
  const scaleMode = $derived(facetsStore.scaleMode);

  let selectedMapIndex = $state(0);
  const safeMapIndex = $derived(
    Math.min(selectedMapIndex, Math.max(0, facetVisualizations.length - 1))
  );
  const columnsValue = $derived(layout.columns);

  const dataFieldItems = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col) => ({ id: col.name, text: col.name }));
  });

  let selectedVariableIds = $state<string[]>([]);

  const canEnable = $derived(
    selectedViz !== undefined && selectedVariableIds.length >= 2
  );

  async function handleEnableFacets() {
    if (!selectedViz?.id || selectedVariableIds.length < 2) return;
    await facetsStore.enable(selectedViz.id, selectedVariableIds);
  }

  interface DndVariable {
    id: string;
    name: string;
  }

  const FLIP_DURATION_MS = 200;
  const DND_TYPE = 'facet-variables';
  const RECENT_DND_INTERACTION_ATTRIBUTE = 'data-khartis-recent-dnd-at';

  let dndVariables = $state<DndVariable[]>([]);
  let dragging = false;

  $effect(() => {
    if (!dragging) {
      dndVariables = variables.map((v) => ({ id: v, name: v }));
    }
  });

  function handleConsider(e: Event): void {
    dragging = true;
    markRecentDndInteraction();
    dndVariables = (e as CustomEvent).detail.items;
  }

  function handleFinalize(e: Event): void {
    const newItems: DndVariable[] = (e as CustomEvent).detail.items;
    dndVariables = newItems;
    dragging = false;
    markRecentDndInteraction();

    const oldIds = variables;
    const newIds = newItems.map((item) => item.id);

    for (let i = 0; i < newIds.length; i++) {
      if (oldIds[i] !== newIds[i]) {
        const fromIndex = oldIds.indexOf(newIds[i]);
        facetsStore.reorderVariables(fromIndex, i);
        break;
      }
    }
  }

  function markRecentDndInteraction(): void {
    document.body.setAttribute(
      RECENT_DND_INTERACTION_ATTRIBUTE,
      String(Date.now())
    );
  }

  function handleMoveVariable(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= dndVariables.length) {
      return;
    }

    void facetsStore.reorderVariables(index, nextIndex);
  }

  const FACETS_HELP_URL =
    'https://cartographie.sciencespo.fr/khartis/help/facets';

  function handleLearnMore() {
    window.open(FACETS_HELP_URL, '_blank');
  }

  function handleConfigureVisualization() {
    globalState.selectedTool = undefined;
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    setTimeout(() => {
      document
        .querySelector('#choose-visualization')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleExit() {
    facetsStore.disable();
    selectedMapIndex = 0;
  }

  function handleColumnsChange(value: number) {
    facetsStore.setColumns(Math.max(1, Math.min(6, value)) as number);
  }

  const mapCount = $derived(facetVisualizations.length);
  const mapPositions = $derived(
    Array.from({ length: mapCount }, (_, i) => i + 1)
  );

  const mapRows = $derived.by(() => {
    const rows: number[][] = [];
    const cols = layout.columns;
    for (let i = 0; i < mapPositions.length; i += cols) {
      rows.push(mapPositions.slice(i, i + cols));
    }
    return rows;
  });
</script>

<div id="khartis-facets-tool">
  {#if enabled}
    <!-- Active state -->
    <div class="facets-content">
      <!-- Affichage section -->
      <div class="section">
        <div class="section-heading">
          <span class="section-title">{m.facets_display_section()}</span>
          <div class="section-divider"></div>
        </div>
        <p class="helper-text">{m.facets_display_helper()}</p>
        <div class="slider-wrapper">
          <Slider
            min={1}
            max={6}
            step={1}
            labelText={m.facets_columns_label()}
            value={columnsValue}
            on:change={(e) => handleColumnsChange(e.detail)}
            minLabel=""
            maxLabel=""
          />
        </div>
        <div class="toggle-wrapper">
          <Toggle
            size="sm"
            labelText={m.facets_sync_pan_zoom()}
            hideLabel={false}
            toggled={syncPanZoom}
            on:toggle={() => facetsStore.toggleSyncPanZoom()}
          />
        </div>
        <div class="toggle-wrapper">
          <Toggle
            size="sm"
            labelText={m.facets_shared_scale()}
            hideLabel={false}
            toggled={scaleMode === SCALE_MODE.SHARED}
            on:toggle={() => facetsStore.toggleScaleMode()}
          />
        </div>
        {#if mapCount > 9}
          <p class="warning-text">{m.facets_performance_warning()}</p>
        {/if}
      </div>

      <!-- Distribution section -->
      {#if mapCount > 0}
        <div class="section">
          <div class="section-heading">
            <span class="section-title">{m.facets_distribution_section()}</span>
            <div class="section-divider"></div>
          </div>
          <p class="helper-text">{m.facets_distribution_helper()}</p>

          <!-- Cartes ContentSwitcher (2-column grid) -->
          <div class="maps-switcher">
            <p class="maps-label">{m.facets_maps_label()}</p>
            <div class="maps-grid">
              {#each mapRows as row, rowIdx (rowIdx)}
                <div class="maps-row">
                  {#each row as pos (pos)}
                    <button
                      class="map-btn"
                      class:selected={safeMapIndex === pos - 1}
                      onclick={() => (selectedMapIndex = pos - 1)}
                    >
                      {pos}
                    </button>
                  {/each}
                </div>
              {/each}
            </div>
          </div>

          <!-- Variables order (drag-drop) -->
          <div class="variables-section">
            <p class="variables-label">{m.facets_variables_label()}</p>
            <div
              class="variables-dnd-list"
              use:dndzone={{
                items: dndVariables,
                flipDurationMs: FLIP_DURATION_MS,
                type: DND_TYPE,
                dropTargetStyle: {}
              }}
              onconsider={handleConsider}
              onfinalize={handleFinalize}
            >
              {#each dndVariables as item, i (item.id)}
                <div class="variable-row">
                  <div class="drag-handle">
                    <Draggable size={16} />
                  </div>
                  <input
                    type="radio"
                    class="bx--radio-button__input"
                    name="variable-order"
                    value={item.name}
                    checked={i === safeMapIndex}
                    readonly
                  />
                  <span class="variable-tag">{item.name}</span>
                  <div class="variable-actions">
                    <IconButton
                      kind="ghost"
                      size="small"
                      icon={ArrowUp}
                      iconDescription={m.facets_move_up()}
                      disabled={i === 0}
                      onclick={() => handleMoveVariable(i, -1)}
                    />
                    <IconButton
                      kind="ghost"
                      size="small"
                      icon={ArrowDown}
                      iconDescription={m.facets_move_down()}
                      disabled={i === dndVariables.length - 1}
                      onclick={() => handleMoveVariable(i, 1)}
                    />
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Link -->
      <button class="link-btn" onclick={handleLearnMore}>
        <span>{m.facets_learn_more()}</span>
        <Launch size={16} />
      </button>

      <!-- Exit button -->
      <Button kind="danger-tertiary" style="width: 100%;" onclick={handleExit}>
        {m.facets_exit_mode()}
      </Button>
    </div>
  {:else}
    <!-- Inactive state -->
    <div class="facets-content">
      <p class="helper-text">{m.facets_collection_description()}</p>

      {#if selectedViz}
        <div class="field-group">
          <MultiSelect
            labelText={m.facets_select_variables()}
            label={m.facets_variables_placeholder()}
            items={dataFieldItems}
            selectedIds={selectedVariableIds}
            on:select={(e) => {
              selectedVariableIds = e.detail.selectedIds;
            }}
          />
        </div>
        {#if selectedVariableIds.length > 0 && selectedVariableIds.length < 2}
          <p class="warning-text">{m.facets_min_variables_warning()}</p>
        {/if}
        <Button
          kind="primary"
          style="width: 100%;"
          disabled={!canEnable}
          onclick={handleEnableFacets}
        >
          {m.facets_generate()}
        </Button>
      {:else}
        <p class="helper-text">{m.facets_select_viz_first()}</p>
        <div class="configure-btn-wrapper">
          <Button
            kind="secondary"
            icon={SettingsAdjust}
            style="width: 100%;"
            onclick={handleConfigureVisualization}
          >
            {m.facets_configure_visualization()}
          </Button>
        </div>
      {/if}

      <button class="link-btn" onclick={handleLearnMore}>
        <span>{m.facets_learn_more()}</span>
        <Launch size={16} />
      </button>
    </div>
  {/if}
</div>

<style>
  .facets-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
  }

  .helper-text {
    font-size: 0.75rem;
    color: var(--cds-text-helper, #6f6f6f);
    line-height: 1rem;
    letter-spacing: 0.32px;
    margin: 0;
    white-space: pre-wrap;
  }

  .link-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--cds-link-primary, #726e6e);
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .configure-btn-wrapper {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02, 4px);
  }

  .warning-text {
    font-size: 0.75rem;
    color: var(--cds-support-warning, #f1c21b);
    line-height: 1rem;
    margin: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04, 12px);
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

  .slider-wrapper :global(.bx--slider-container) {
    width: 100%;
  }

  .toggle-wrapper {
    display: flex;
    align-items: center;
  }

  .toggle-wrapper :global(.bx--toggle-input__label) {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
  }

  /* Maps ContentSwitcher */
  .maps-switcher {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
  }

  .maps-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    line-height: 1rem;
    letter-spacing: 0.32px;
    margin: 0;
  }

  .maps-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .maps-row {
    display: flex;
    gap: 0;
    border: 1px solid var(--cds-border-inverse, #cac5c4);
    border-radius: 4px;
    overflow: hidden;
  }

  .map-btn {
    flex: 1;
    padding: 7px 16px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--cds-text-secondary, #525252);
    line-height: 18px;
    letter-spacing: 0.16px;
    text-align: left;
  }

  .map-btn + .map-btn {
    border-left: 1px solid var(--cds-border-inverse, #cac5c4);
  }

  .map-btn.selected {
    background-color: var(--cds-layer-selected-inverse, #cac5c4);
    color: var(--cds-text-primary, #161616);
  }

  /* Variables drag-drop section */
  .variables-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
  }

  .variables-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    line-height: 1rem;
    letter-spacing: 0.32px;
    margin: 0;
  }

  .variables-dnd-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
    outline: none;
  }

  .variable-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    background-color: var(--cds-layer-01, #f4f4f4);
    padding: var(--cds-spacing-02, 4px) var(--cds-spacing-03, 8px);
    border-radius: 4px;
    cursor: grab;
  }

  .variable-row:active {
    cursor: grabbing;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    color: var(--cds-icon-secondary, #525252);
    flex-shrink: 0;
  }

  .variable-row input[type='radio'] {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    cursor: default;
    accent-color: var(--cds-icon-primary, #161616);
  }

  .variables-dnd-list :global([aria-grabbed='true']) {
    opacity: 0.4;
  }

  /* Purple variable tag */
  .variable-tag {
    display: inline-flex;
    align-items: center;
    flex: 1;
    height: 18px;
    padding: 2px 8px;
    background-color: var(--cds-tag-background-purple, #e8daff);
    border: 1px solid var(--cds-tag-border-purple, #be95ff);
    border-radius: 1000px;
    font-size: 0.75rem;
    color: var(--cds-tag-color-purple, #6929c4);
    line-height: 1rem;
    letter-spacing: 0.32px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .variable-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
</style>
