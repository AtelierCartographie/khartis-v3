<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { Launch, SettingsAdjust } from 'carbon-icons-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { facetsStore, SCALE_MODE } from './facets.store.svelte';
  import {
    visualizationStore,
    PrimitiveFilterType,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';
  import {
    FillMode,
    SymbolMode,
    ColorMode,
    StrokeMode,
    ThicknessMode
  } from '$lib/features/main-toolbar/constants';
  import SliderWithInput from '$lib/features/main-toolbar/visualization-tab/components/shared/slider-with-input.svelte';

  const FACETS_HELP_URL =
    'https://cartographie.sciencespo.fr/khartis/help/facets';
  const CONFIGURE_SECTION_ID = 'configure-visualization';
  const FACETS_COLUMNS_MIN = 1;
  const FACETS_COLUMNS_MAX = 6;
  const FACETS_PERFORMANCE_THRESHOLD = 9;

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

  const mapCount = $derived(facetVisualizations.length);
  const columnsValue = $derived(layout.columns);

  const mapRows = $derived.by(() => {
    const rows: number[][] = [];
    const cols = Math.max(1, layout.columns);
    for (let i = 1; i <= mapCount; i += cols) {
      const row: number[] = [];
      for (let j = 0; j < cols && i + j <= mapCount; j += 1) {
        row.push(i + j);
      }
      rows.push(row);
    }
    return rows;
  });

  const baseVisualization = $derived.by(() => {
    const baseId = facetsStore.baseVisualizationId;
    if (!baseId) return undefined;
    return visualizationStore.visualizations.find((v) => v.id === baseId);
  });

  interface FacetSlot {
    key: keyof NonNullable<VisualizationConfig['mapping']>;
    label: string;
  }

  interface FacetSection {
    id: string;
    title: string;
    slots: FacetSlot[];
  }

  function resolveSymbolSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    const symbolMode = viz.modes?.symbol;

    if (symbolMode === SymbolMode.PROPORTIONAL) {
      slots.push({ key: 'sizeColumn', label: m.facets_slot_size_shape() });
    } else if (symbolMode === SymbolMode.CLASSES) {
      slots.push({ key: 'valueColumn', label: m.facets_slot_size_shape() });
    } else if (symbolMode === SymbolMode.CATEGORIES) {
      slots.push({ key: 'categoryColumn', label: m.facets_slot_size_shape() });
    }

    const fillMode = viz.modes?.fill;
    if (fillMode === FillMode.CLASSES) {
      const alreadyHas = slots.some((s) => s.key === 'valueColumn');
      if (!alreadyHas) {
        slots.push({ key: 'valueColumn', label: m.facets_slot_fill() });
      }
    } else if (fillMode === FillMode.CATEGORIES) {
      const alreadyHas = slots.some((s) => s.key === 'categoryColumn');
      if (!alreadyHas) {
        slots.push({ key: 'categoryColumn', label: m.facets_slot_fill() });
      }
    }

    return slots;
  }

  function resolvePolygonSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    if (viz.modes?.fill === FillMode.CLASSES) {
      slots.push({ key: 'valueColumn', label: m.facets_slot_fill() });
    } else if (viz.modes?.fill === FillMode.CATEGORIES) {
      slots.push({ key: 'categoryColumn', label: m.facets_slot_fill() });
    }
    if (viz.modes?.color === ColorMode.CLASSES) {
      if (!slots.some((s) => s.key === 'valueColumn')) {
        slots.push({ key: 'valueColumn', label: m.facets_slot_color() });
      }
    }
    if (viz.modes?.stroke === StrokeMode.CLASSES) {
      if (!slots.some((s) => s.key === 'valueColumn')) {
        slots.push({ key: 'valueColumn', label: m.facets_slot_stroke() });
      }
    }
    return slots;
  }

  function resolveLineSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    if (viz.modes?.thickness === ThicknessMode.CLASSES) {
      slots.push({ key: 'valueColumn', label: m.facets_slot_size_shape() });
    }
    return slots;
  }

  const sections = $derived.by((): FacetSection[] => {
    const viz = baseVisualization;
    if (!viz) return [];

    const result: FacetSection[] = [];
    const primitives = viz.primitiveFilters ?? [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.TEXT
    ];

    if (primitives.includes(PrimitiveFilterType.POINT)) {
      const slots = resolveSymbolSlots(viz);
      if (slots.length > 0) {
        result.push({
          id: 'symbols',
          title: m.facets_section_symbols(),
          slots
        });
      }
    }

    if (primitives.includes(PrimitiveFilterType.POLYGON)) {
      const slots = resolvePolygonSlots(viz);
      if (slots.length > 0) {
        result.push({
          id: 'polygons',
          title: m.facets_section_polygons(),
          slots
        });
      }
    }

    if (primitives.includes(PrimitiveFilterType.LINE)) {
      const slots = resolveLineSlots(viz);
      if (slots.length > 0) {
        result.push({
          id: 'lines',
          title: m.facets_section_lines(),
          slots
        });
      }
    }

    return result;
  });

  const numericDataFields = $derived.by(() => {
    const baseDatasetId = baseVisualization?.datasetId;
    if (!baseDatasetId) return [] as string[];
    const dataset = datasetsStore.datasets.find((d) => d.id === baseDatasetId);
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col) => col.name);
  });

  function getSlotVariable(
    mapIndex: number,
    slotKey: FacetSlot['key']
  ): string | undefined {
    const viz = facetVisualizations[mapIndex];
    if (!viz) return undefined;
    return viz.mapping[slotKey];
  }

  function handleSlotVariableChange(
    slotKey: FacetSlot['key'],
    variable: string
  ) {
    facetsStore.setVariableForSlot(safeMapIndex, slotKey, variable);
  }

  function handleConfigureVisualization() {
    globalState.selectedTool = undefined;
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    setTimeout(() => {
      document
        .querySelector(`#${CONFIGURE_SECTION_ID}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleLearnMore() {
    window.open(FACETS_HELP_URL, '_blank');
  }

  function handleExit() {
    facetsStore.disable();
    selectedMapIndex = 0;
  }

  function handleColumnsChange(value: number) {
    const clamped = Math.max(
      FACETS_COLUMNS_MIN,
      Math.min(FACETS_COLUMNS_MAX, value)
    );
    facetsStore.setColumns(clamped);
  }
</script>

<div id="khartis-facets-tool">
  {#if enabled && facetVisualizations.length > 0}
    <div class="facets-content">
      <section class="section">
        <header class="section-heading">
          <span class="section-title">{m.facets_display_section()}</span>
          <span class="section-divider" aria-hidden="true"></span>
        </header>
        <p class="helper-text">{m.facets_display_helper()}</p>
        <SliderWithInput
          label={m.facets_columns_label()}
          value={columnsValue}
          min={0}
          max={FACETS_COLUMNS_MAX}
          step={1}
          onchange={handleColumnsChange}
        />
        <div class="toggle-row">
          <Switch
            size="sm"
            labelText={m.facets_shared_scale_label()}
            toggled={scaleMode === SCALE_MODE.SHARED}
            onchange={() => facetsStore.toggleScaleMode()}
          />
        </div>
        <div class="toggle-row">
          <Switch
            size="sm"
            labelText={m.facets_sync_pan_zoom()}
            toggled={syncPanZoom}
            onchange={() => facetsStore.toggleSyncPanZoom()}
          />
        </div>
        {#if mapCount > FACETS_PERFORMANCE_THRESHOLD}
          <p class="warning-text">{m.facets_performance_warning()}</p>
        {/if}
      </section>

      {#if mapCount > 0}
        <section class="section">
          <header class="section-heading">
            <span class="section-title">{m.facets_distribution_section()}</span>
            <span class="section-divider" aria-hidden="true"></span>
          </header>
          <p class="helper-text">{m.facets_distribution_helper()}</p>
          <p class="sub-label">{m.facets_maps_label()}</p>
          <div
            class="maps-grid"
            role="radiogroup"
            aria-label={m.facets_maps_label()}
          >
            {#each mapRows as row, rowIdx (rowIdx)}
              <div class="maps-row">
                {#each row as pos (pos)}
                  <button
                    type="button"
                    class="map-btn"
                    class:selected={safeMapIndex === pos - 1}
                    onclick={() => (selectedMapIndex = pos - 1)}
                    aria-pressed={safeMapIndex === pos - 1}
                  >
                    {pos}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#each sections as section (section.id)}
        <section class="section">
          <header class="section-heading plain">
            <span class="section-title">{section.title}</span>
          </header>
          {#each section.slots as slot, slotIdx (section.id + slot.key + slotIdx)}
            <div class="slot-card">
              <header class="slot-heading">
                <span class="slot-title">{slot.label}</span>
                <span class="section-divider" aria-hidden="true"></span>
              </header>
              <p class="sub-label">{m.facets_variables_label()}</p>
              <ul
                class="variable-list"
                role="radiogroup"
                aria-label={slot.label}
              >
                {#each variables as variable (section.id + slot.key + slotIdx + variable)}
                  <li class="variable-item">
                    <label class="variable-label">
                      <input
                        type="radio"
                        name={`facet-slot-${section.id}-${slot.key}-${slotIdx}`}
                        class="variable-radio"
                        value={variable}
                        checked={getSlotVariable(safeMapIndex, slot.key) ===
                          variable}
                        onchange={() =>
                          handleSlotVariableChange(slot.key, variable)}
                      />
                      <span class="variable-tag">
                        <span class="variable-tag-text">{variable}</span>
                        {#if numericDataFields.includes(variable)}
                          <span class="variable-tag-badge">123</span>
                        {/if}
                      </span>
                    </label>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}

      <button class="link-btn" type="button" onclick={handleLearnMore}>
        <span>{m.facets_learn_more()}</span>
        <Launch size={16} />
      </button>

      <Button kind="danger-tertiary" style="width: 100%;" onclick={handleExit}>
        {m.facets_exit_mode()}
      </Button>
    </div>
  {:else}
    <div class="facets-content">
      <p class="helper-text">{m.facets_collection_description()}</p>
      <p class="helper-text">{m.facets_create_instruction()}</p>

      <button class="link-btn" type="button" onclick={handleLearnMore}>
        <span>{m.facets_learn_more()}</span>
        <Launch size={16} />
      </button>

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
</div>

<style lang="scss">
  .facets-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
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

  .section-heading.plain .section-title {
    font-size: 1rem;
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
    white-space: pre-wrap;
  }

  .sub-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    line-height: 1rem;
    letter-spacing: 0.32px;
    margin: 0;
  }

  .warning-text {
    font-size: 0.75rem;
    color: var(--cds-support-warning, #f1c21b);
    line-height: 1rem;
    margin: 0;
  }

  .toggle-row {
    display: flex;
    align-items: center;
  }

  .toggle-row :global(.kh-switch-label) {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
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

  .slot-card {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
    padding: var(--cds-spacing-04, 12px);
    background-color: var(--cds-layer-01, #f4f4f4);
    border-radius: 4px;
  }

  .slot-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    height: 24px;
  }

  .slot-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
    line-height: 18px;
    letter-spacing: 0.16px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .variable-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02, 4px);
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .variable-item {
    margin: 0;
  }

  .variable-label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    cursor: pointer;
  }

  .variable-radio {
    width: 16px;
    height: 16px;
    accent-color: var(--cds-icon-primary, #161616);
    flex-shrink: 0;
    cursor: pointer;
  }

  .variable-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02, 4px);
    flex: 1;
    min-width: 0;
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
  }

  .variable-tag-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .variable-tag-badge {
    font-size: 0.625rem;
    font-weight: 500;
    letter-spacing: 0.32px;
    padding: 0 4px;
    border: 1px solid currentColor;
    border-radius: 2px;
    flex-shrink: 0;
  }
</style>
