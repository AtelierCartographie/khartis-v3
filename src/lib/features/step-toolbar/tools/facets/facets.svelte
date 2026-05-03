<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button, Link } from 'carbon-components-svelte';
  import {
    CharacterWholeNumber,
    Launch,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { facetsStore, SCALE_MODE } from './facets.store.svelte';
  import {
    getSymbolPrimitive,
    getTextPrimitive,
    visualizationStore,
    PrimitiveFilterType,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { FACET_SLOT, type FacetSlotPath } from './facets.store.svelte';
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
  import SliderWithInput from '$lib/features/commons/components/viz-controls/slider-with-input.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';

  const FACETS_HELP_URL =
    'https://www.sciencespo.fr/cartographie/khartis/docs/';
  const CONFIGURE_SECTION_ID = 'configure-visualization';
  const FACETS_COLUMNS_MIN = 1;
  const FACETS_COLUMNS_MAX = 4;

  const enabled = $derived(facetsStore.enabled);
  const layout = $derived(facetsStore.layout);
  const variables = $derived(facetsStore.variables);
  const facetVisualizations = $derived(facetsStore.facetVisualizations);

  let selectedMapIndex = $state(0);

  const safeMapIndex = $derived(
    Math.min(selectedMapIndex, Math.max(0, facetVisualizations.length - 1))
  );

  const mapCount = $derived(facetVisualizations.length);
  const columnsValue = $derived(layout.columns);
  const isSharedScale = $derived(facetsStore.scaleMode === SCALE_MODE.SHARED);

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
    path: FacetSlotPath;
    label: string;
  }

  interface FacetSection {
    id: string;
    title: string;
    slots: FacetSlot[];
  }

  function pushSlot(slots: FacetSlot[], path: FacetSlotPath, label: string) {
    if (!slots.some((slot) => slot.path === path)) {
      slots.push({ path, label });
    }
  }

  function resolveSymbolSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    const symbolMode = getSymbolPrimitive(viz)?.mode ?? SymbolMode.UNIQUE;

    if (symbolMode === SymbolMode.PROPORTIONAL) {
      pushSlot(slots, FACET_SLOT.SYMBOL_SIZE, m.facets_slot_size_shape());
    } else if (symbolMode === SymbolMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.SYMBOL_VALUE, m.facets_slot_size_shape());
    } else if (symbolMode === SymbolMode.CATEGORIES) {
      pushSlot(slots, FACET_SLOT.SYMBOL_CATEGORY, m.facets_slot_size_shape());
    }

    const fillMode = viz.modes?.fill;
    if (fillMode === FillMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.SYMBOL_FILL_VALUE, m.facets_slot_fill());
    } else if (fillMode === FillMode.CATEGORIES) {
      pushSlot(slots, FACET_SLOT.SYMBOL_FILL_CATEGORY, m.facets_slot_fill());
    }

    const strokeMode = viz.modes?.stroke;
    if (strokeMode === StrokeMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.SYMBOL_VALUE, m.facets_slot_stroke());
    } else if (strokeMode === StrokeMode.CATEGORIES) {
      pushSlot(slots, FACET_SLOT.SYMBOL_CATEGORY, m.facets_slot_stroke());
    }

    return slots;
  }

  function resolvePolygonSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    if (viz.modes?.fill === FillMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.POLYGON_VALUE, m.facets_slot_fill());
    } else if (viz.modes?.fill === FillMode.CATEGORIES) {
      pushSlot(slots, FACET_SLOT.POLYGON_CATEGORY, m.facets_slot_fill());
    }
    if (viz.modes?.stroke === StrokeMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.POLYGON_VALUE, m.facets_slot_stroke());
    } else if (viz.modes?.stroke === StrokeMode.CATEGORIES) {
      pushSlot(slots, FACET_SLOT.POLYGON_CATEGORY, m.facets_slot_stroke());
    }
    return slots;
  }

  function resolveLineSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    if (viz.modes?.thickness === ThicknessMode.PROPORTIONAL) {
      pushSlot(slots, FACET_SLOT.LINE_SIZE, m.facets_slot_size_shape());
    } else if (viz.modes?.thickness === ThicknessMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.LINE_VALUE, m.facets_slot_size_shape());
    }

    if (viz.modes?.color === ColorMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.LINE_VALUE, m.facets_slot_color());
    } else if (viz.modes?.color === ColorMode.CATEGORIES) {
      pushSlot(slots, FACET_SLOT.LINE_CATEGORY, m.facets_slot_color());
    }
    return slots;
  }

  function resolveTextSlots(viz: VisualizationConfig): FacetSlot[] {
    const slots: FacetSlot[] = [];
    const background = getTextPrimitive(viz)?.background;

    if (background?.fillMode === FillMode.CLASSES) {
      pushSlot(slots, FACET_SLOT.TEXT_BACKGROUND_VALUE, m.facets_slot_fill());
    } else if (background?.fillMode === FillMode.CATEGORIES) {
      pushSlot(
        slots,
        FACET_SLOT.TEXT_BACKGROUND_CATEGORY,
        m.facets_slot_fill()
      );
    }

    if (background?.strokeMode === StrokeMode.CLASSES) {
      pushSlot(
        slots,
        FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE,
        m.facets_slot_stroke()
      );
    } else if (background?.strokeMode === StrokeMode.CATEGORIES) {
      pushSlot(
        slots,
        FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY,
        m.facets_slot_stroke()
      );
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

    if (primitives.includes(PrimitiveFilterType.TEXT)) {
      const slots = resolveTextSlots(viz);
      if (slots.length > 0) {
        result.push({
          id: 'texts',
          title: m.texts_title(),
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
    slotPath: FacetSlot['path']
  ): string | undefined {
    const viz = facetVisualizations[mapIndex];
    if (!viz) return undefined;
    switch (slotPath) {
      case FACET_SLOT.SYMBOL_VALUE:
        return viz.symbol?.valueColumn;
      case FACET_SLOT.SYMBOL_CATEGORY:
        return viz.symbol?.categoryColumn;
      case FACET_SLOT.SYMBOL_SIZE:
        return viz.symbol?.sizeColumn;
      case FACET_SLOT.SYMBOL_FILL_VALUE:
        return viz.symbol?.fillValueColumn;
      case FACET_SLOT.SYMBOL_FILL_CATEGORY:
        return viz.symbol?.fillCategoryColumn;
      case FACET_SLOT.POLYGON_VALUE:
        return viz.polygon?.valueColumn;
      case FACET_SLOT.POLYGON_CATEGORY:
        return viz.polygon?.categoryColumn;
      case FACET_SLOT.LINE_VALUE:
        return viz.line?.valueColumn;
      case FACET_SLOT.LINE_CATEGORY:
        return viz.line?.categoryColumn;
      case FACET_SLOT.LINE_SIZE:
        return viz.line?.sizeColumn;
      case FACET_SLOT.TEXT_VALUE:
        return viz.text?.valueColumn;
      case FACET_SLOT.TEXT_CATEGORY:
        return viz.text?.categoryColumn;
      case FACET_SLOT.TEXT_BACKGROUND_VALUE:
        return viz.text?.background?.valueColumn;
      case FACET_SLOT.TEXT_BACKGROUND_CATEGORY:
        return viz.text?.background?.categoryColumn;
      case FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE:
        return viz.text?.background?.strokeValueColumn;
      case FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY:
        return viz.text?.background?.strokeCategoryColumn;
    }
  }

  function handleSlotVariableChange(
    slotPath: FacetSlot['path'],
    variable: string
  ) {
    facetsStore.setVariableForSlot(safeMapIndex, slotPath, variable);
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

  function handleColumnsChange(value: number) {
    const clamped = Math.max(
      FACETS_COLUMNS_MIN,
      Math.min(FACETS_COLUMNS_MAX, value)
    );
    facetsStore.setColumns(clamped);
  }

  async function handleScaleModeChange(shared: boolean) {
    if (
      (shared && facetsStore.scaleMode === SCALE_MODE.SHARED) ||
      (!shared && facetsStore.scaleMode === SCALE_MODE.INDEPENDENT)
    ) {
      return;
    }

    await facetsStore.toggleScaleMode();
  }

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
        max={FACETS_COLUMNS_MAX}
        step={1}
        showMinMax
        onchange={handleColumnsChange}
      />
      <div class="field-group">
        <Switch
          size="sm"
          labelText={m.facets_scale_shared_label()}
          toggled={isSharedScale}
          onchange={handleScaleModeChange}
        />
      </div>
    </section>

    <section class="section">
      <header class="section-heading">
        <span class="section-title">{m.facets_distribution_section()}</span>
        <span class="section-divider" aria-hidden="true"></span>
      </header>
      <p class="helper-text">{m.facets_distribution_helper()}</p>

      {#if mapCount > 0}
        <div class="maps-picker">
          <span class="field-label">{m.facets_maps_label()}</span>
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
        </div>
      {/if}

      {#each sections as section (section.id)}
        <div class="subsection">
          <h2 class="subsection-title">{section.title}</h2>
          {#each section.slots as slot, slotIdx (section.id + slot.path + slotIdx)}
            <div class="slot-card">
              <header class="slot-heading">
                <span class="slot-title">{slot.label}</span>
                <span class="slot-divider" aria-hidden="true"></span>
              </header>
              <div class="slot-body">
                <span class="field-label">{m.facets_variables_label()}</span>
                <ul
                  class="variable-list"
                  role="radiogroup"
                  aria-label={slot.label}
                >
                  {#each variables as variable (section.id + '-' + slot.path + '-' + variable)}
                    {@const isNumeric = numericDataFields.includes(variable)}
                    <li class="variable-item">
                      <label class="variable-label">
                        <input
                          type="radio"
                          name={`facet-slot-${section.id}-${slot.path}`}
                          class="variable-radio"
                          value={variable}
                          checked={getSlotVariable(safeMapIndex, slot.path) ===
                            variable}
                          onchange={() =>
                            handleSlotVariableChange(slot.path, variable)}
                        />
                        <span class="variable-tag">
                          <span class="variable-tag-text">{variable}</span>
                          {#if isNumeric}
                            <span class="variable-tag-icon">
                              <CharacterWholeNumber size={16} />
                            </span>
                          {/if}
                        </span>
                      </label>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </section>

    <Link href={FACETS_HELP_URL} target="_blank" size="sm" icon={Launch}>
      {m.facets_learn_more()}
    </Link>
  {:else}
    <p class="helper-text">{m.facets_collection_description()}</p>
    <p class="helper-text">{m.facets_create_instruction()}</p>

    <Link href={FACETS_HELP_URL} target="_blank" size="sm" icon={Launch}>
      {m.facets_learn_more()}
    </Link>

    <Button
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

  .field-label {
    display: block;
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    line-height: 1rem;
    letter-spacing: 0.32px;
    font-weight: 400;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
  }

  .maps-picker {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
  }

  .maps-grid {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02, 4px);
  }

  .maps-row {
    display: flex;
    border: 1px solid var(--cds-border-inverse, #cac5c4);
    border-radius: 4px;
    overflow: hidden;
  }

  .map-btn {
    flex: 1;
    min-width: 0;
    padding: 7px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--cds-text-secondary, #525252);
    line-height: 18px;
    letter-spacing: 0.16px;
    text-align: left;
    font-family: inherit;
  }

  .map-btn + .map-btn {
    border-left: 1px solid var(--cds-border-inverse, #cac5c4);
  }

  .map-btn.selected {
    background-color: var(--cds-layer-selected-inverse, #cac5c4);
    color: var(--cds-text-primary, #161616);
  }

  .map-btn:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
  }

  .subsection {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
    padding: var(--cds-spacing-04, 12px);
    background-color: var(--cds-layer-01, #f4f4f4);
    border-radius: 4px;
  }

  .subsection-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
    line-height: 18px;
    letter-spacing: 0.16px;
    margin: 0;
  }

  .slot-card {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
    padding: var(--cds-spacing-03, 8px) var(--cds-spacing-05, 16px)
      var(--cds-spacing-05, 16px);
    background-color: var(--cds-layer-01, #f4f4f4);
  }

  .slot-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    height: 24px;
  }

  .slot-title {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--cds-text-primary, #161616);
    line-height: 1rem;
    letter-spacing: 0.32px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .slot-divider {
    flex: 1;
    height: 1px;
    background-color: var(--cds-border-subtle-01, #c6c6c6);
  }

  .slot-body {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
  }

  .variable-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
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
    width: 20px;
    height: 20px;
    accent-color: var(--cds-icon-primary, #161616);
    flex-shrink: 0;
    cursor: pointer;
    margin: 0;
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
