<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Category,
    ChartBubble,
    CircleFilled,
    Tag
  } from 'carbon-icons-svelte';
  import { SymbolMode } from '../../constants';
  import {
    ALL_PRIMITIVE_FILTERS,
    getSymbolPrimitive,
    PrimitiveFilterType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { ProportionalType } from '$lib/features/main-toolbar/constants';
  import type {
    MissingDataConfig,
    SymbolPrimitiveConfig,
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import {
    SectionHeading,
    InfoPopover,
    VizFilterButton,
    VizFilterPanel
  } from './shared';
  import type { VizDataFilter } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    SymbolModeUnique,
    SymbolModeProportional,
    SymbolModeCategories
  } from './symbols';

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    disabled?: boolean;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onSymbolsChange?: (
      updates: Partial<VisualizationConfig['symbols']>
    ) => void;
    onSymbolPrimitiveChange?: (updates: Partial<SymbolPrimitiveConfig>) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onStrokeClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
    filters?: VizDataFilter[];
    onAddFilter?: (filter: Omit<VizDataFilter, 'id'>) => void;
    onUpdateFilter?: (
      filterId: string,
      updates: Partial<Omit<VizDataFilter, 'id'>>
    ) => void;
    onRemoveFilter?: (filterId: string) => void;
    onClearFilters?: () => void;
  }

  let {
    dataFields = [],
    visualization,
    disabled = false,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onSymbolPrimitiveChange,
    onMappingChange,
    onMissingDataChange,
    onClassificationChange,
    onStrokeClassificationChange,
    onInvertPalette,
    onToggleVisibility,
    filters = [],
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let filterSectionVisible = $state(false);
  let symbolMode = $state<SymbolMode>(SymbolMode.UNIQUE);
  const enabled = $derived.by(() => {
    const primitiveFilters =
      visualization?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    return primitiveFilters.includes(PrimitiveFilterType.POINT);
  });

  function handleToggleChange(checked: boolean) {
    onToggleVisibility?.(checked);
  }

  $effect(() => {
    if (visualization) {
      symbolMode = getSymbolPrimitive(visualization)?.mode ?? SymbolMode.UNIQUE;
    }
  });

  const symbolModeItems = [
    { icon: CircleFilled, label: m.symbol_mode_unique(), iconSize: 16 },
    { icon: ChartBubble, label: m.symbol_mode_proportional(), iconSize: 16 },
    { icon: Category, label: m.symbol_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.symbol_mode_categories(), iconSize: 16 }
  ];

  function handleSymbolModeChange(index: number) {
    const modes = [
      SymbolMode.UNIQUE,
      SymbolMode.PROPORTIONAL,
      SymbolMode.CLASSES,
      SymbolMode.CATEGORIES
    ];
    const next = modes[index] || SymbolMode.UNIQUE;
    if (next === symbolMode) return;
    symbolMode = next;
    onModesChange?.({ symbol: symbolMode });
    onClassificationChange?.({
      colors: undefined,
      paletteId: undefined,
      breaks: undefined,
      counts: undefined,
      inverted: false,
      patternId: undefined,
      patternParams: undefined,
      labels: undefined,
      breakpointValue: null,
      categoryShapes: undefined
    });
    if (symbolMode === SymbolMode.UNIQUE) {
      onMappingChange?.({
        sizeColumn: undefined,
        valueColumn: undefined,
        categoryColumn: undefined
      });
    } else if (symbolMode === SymbolMode.PROPORTIONAL) {
      onMappingChange?.({ categoryColumn: undefined });
    } else if (symbolMode === SymbolMode.CLASSES) {
      onMappingChange?.({ categoryColumn: undefined });
    } else if (symbolMode === SymbolMode.CATEGORIES) {
      onMappingChange?.({ sizeColumn: undefined, valueColumn: undefined });
    }
  }

  function handleOpenDiscretization() {
    discretizationModalOpen = true;
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  const symbolModeIndex = $derived(
    [
      SymbolMode.UNIQUE,
      SymbolMode.PROPORTIONAL,
      SymbolMode.CLASSES,
      SymbolMode.CATEGORIES
    ].indexOf(symbolMode)
  );

  const isProportionalDouble = $derived(
    symbolMode === SymbolMode.PROPORTIONAL &&
      (getSymbolPrimitive(visualization)?.proportionalType ??
        ProportionalType.SINGLE) === ProportionalType.DOUBLE
  );
</script>

<ExpandableSection
  title={m.symbols_title()}
  defaultOpen={false}
  showToggle
  actionsEnd
  toggleChecked={enabled}
  disabled={disabled}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.symbols_section_info()} />
    <VizFilterButton
      active={filterSectionVisible || filters.length > 0}
      count={filters.length}
      onToggle={() => {
        filterSectionVisible = !filterSectionVisible;
      }}
    />
  {/snippet}

  <div class="symbols-config">
    <SectionHeading
      title={symbolMode === SymbolMode.CATEGORIES
        ? m.size_shape_and_color()
        : isProportionalDouble
          ? m.size_shape_and_fill()
          : m.size_and_shape()}
    />

    <div class="field-group">
      <span class="field-label">
        {m.symbols_title()}
        <InfoPopover text={m.symbol_mode_info()} />
      </span>
      <ToggleTabs
        items={symbolModeItems}
        activeIndex={symbolModeIndex}
        onChange={handleSymbolModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if symbolMode === SymbolMode.UNIQUE}
      <SymbolModeUnique
        dataFields={dataFields}
        visualization={visualization}
        onStyleChange={onStyleChange}
        onModesChange={onModesChange}
        onSymbolsChange={onSymbolsChange}
        onMappingChange={onMappingChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
        onStrokeClassificationChange={onStrokeClassificationChange}
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {:else if symbolMode === SymbolMode.PROPORTIONAL || symbolMode === SymbolMode.CLASSES}
      <SymbolModeProportional
        dataFields={dataFields}
        visualization={visualization}
        symbolMode={symbolMode}
        onSymbolsChange={onSymbolsChange}
        onSymbolPrimitiveChange={onSymbolPrimitiveChange}
        onMappingChange={onMappingChange}
        onModesChange={onModesChange}
        onStyleChange={onStyleChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
        onStrokeClassificationChange={onStrokeClassificationChange}
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {:else if symbolMode === SymbolMode.CATEGORIES}
      <SymbolModeCategories
        dataFields={dataFields}
        visualization={visualization}
        onSymbolsChange={onSymbolsChange}
        onMappingChange={onMappingChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
        onStrokeClassificationChange={onStrokeClassificationChange}
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {/if}
  </div>
</ExpandableSection>

{#if filterSectionVisible}
  <VizFilterPanel
    title={m.symbols_title()}
    dataFields={dataFields}
    filters={filters}
    onAddFilter={onAddFilter ?? (() => {})}
    onUpdateFilter={onUpdateFilter}
    onRemoveFilter={onRemoveFilter ?? (() => {})}
    onClose={() => {
      filterSectionVisible = false;
    }}
  />
{/if}

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  classification={visualization?.symbol?.classification ??
    visualization?.symbolClassification}
  onchange={handleClassificationChange}
/>

<style lang="scss">
  .symbols-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-03);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  :global(.symbols-config .bx--dropdown) {
    max-width: 100%;
  }

  :global(.symbols-config .bx--select) {
    max-width: 100%;
  }

  :global(.symbols-config .bx--radio-button-group) {
    flex-direction: row;
  }
</style>
