<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ChartBubble, CircleFilled, Table, Tag } from 'carbon-icons-svelte';
  import {
    FillMode,
    SymbolMode
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    ALL_PRIMITIVE_FILTERS,
    getSymbolPrimitive,
    PrimitiveFilterType
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { ProportionalType } from '$lib/features/commons/constants/visualization.constants';
  import type {
    MissingDataConfig,
    SymbolPrimitiveConfig,
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import { SectionHeading, VizFilterButton, VizFilterPanel } from '../shared';
  import type { VizDataFilter } from '$lib/features/commons/stores/visualization.store.svelte';
  import {
    SymbolModeUnique,
    SymbolModeProportional,
    SymbolModeCategories
  } from '.';

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    fillVisualization?: VisualizationConfig;
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
    onFillMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onFillClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onStrokeClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onInvertPalette?: () => void;
    onFillInvertPalette?: () => void;
    onStrokeInvertPalette?: () => void;
    onStrokeMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
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
    fillVisualization,
    disabled = false,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onSymbolPrimitiveChange,
    onMappingChange,
    onFillMappingChange,
    onMissingDataChange,
    onClassificationChange,
    onFillClassificationChange,
    onStrokeClassificationChange,
    onInvertPalette,
    onFillInvertPalette,
    onStrokeInvertPalette,
    onStrokeMappingChange,
    onToggleVisibility,
    filters = [],
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'size' | 'fill'>('size');
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
    { icon: Table, label: m.symbol_mode_classes(), iconSize: 16 },
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
    const currentFillMode =
      getSymbolPrimitive(visualization)?.fillMode ?? visualization?.modes?.fill;
    const nextFillMode =
      symbolMode === SymbolMode.CATEGORIES || currentFillMode !== undefined
        ? undefined
        : FillMode.UNIQUE;
    onModesChange?.({
      symbol: symbolMode,
      ...(nextFillMode !== undefined && { fill: nextFillMode })
    });
  }

  function handleOpenDiscretization() {
    discretizationTarget = 'size';
    discretizationModalOpen = true;
  }

  function handleOpenFillDiscretization() {
    discretizationTarget = 'fill';
    discretizationModalOpen = true;
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    if (discretizationTarget === 'fill') {
      onFillClassificationChange?.(classification);
      return;
    }

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

  const activeDiscretizationVisualization = $derived(
    discretizationTarget === 'fill'
      ? (fillVisualization ?? visualization)
      : visualization
  );
  const activeDiscretizationClassification = $derived.by(() => {
    if (discretizationTarget === 'fill') {
      return fillVisualization?.classification;
    }

    return (
      visualization?.symbol?.classification ?? visualization?.classification
    );
  });
  const activeDiscretizationValueColumn = $derived.by(() => {
    if (discretizationTarget === 'fill') {
      return fillVisualization?.mapping.valueColumn;
    }

    return (
      visualization?.symbol?.valueColumn ?? visualization?.mapping.valueColumn
    );
  });
  const activeSizePreview = $derived.by(() => {
    const symbol = getSymbolPrimitive(visualization);
    if (!symbol || discretizationTarget !== 'size') {
      return undefined;
    }

    return {
      shape: symbol.shape,
      minSize: symbol.minSize,
      maxSize: symbol.maxSize
    };
  });
  const activeBinFillStrategy = $derived.by(() => {
    const symbol = getSymbolPrimitive(visualization);
    const classColors =
      symbol?.fillClassification?.colors ??
      fillVisualization?.classification?.colors ??
      [];

    if (symbol?.fillMode === FillMode.CLASSES && classColors.length > 0) {
      return { mode: 'classes' as const, colors: classColors };
    }

    if (typeof symbol?.fillColor === 'string') {
      return { mode: 'unique' as const, colors: [symbol.fillColor] };
    }

    return { mode: 'unique' as const, colors: [] };
  });
</script>

<ExpandableSection
  title={m.symbols_title()}
  description={disabled ? m.primitive_unavailable() : undefined}
  defaultOpen={false}
  showToggle
  toggleVariant="suggestions"
  actionsEnd
  toggleChecked={enabled}
  disabled={disabled}
  disabledReason={disabled ? m.primitive_unavailable_reason() : undefined}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
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
      </span>
      <ToggleTabs
        items={symbolModeItems}
        activeIndex={symbolModeIndex}
        onchange={handleSymbolModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if symbolMode === SymbolMode.UNIQUE}
      <SymbolModeUnique
        dataFields={dataFields}
        visualization={visualization}
        fillVisualization={fillVisualization}
        onStyleChange={onStyleChange}
        onModesChange={onModesChange}
        onSymbolsChange={onSymbolsChange}
        onMappingChange={onMappingChange}
        onFillMappingChange={onFillMappingChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
        onFillClassificationChange={onFillClassificationChange}
        onStrokeClassificationChange={onStrokeClassificationChange}
        onInvertPalette={onInvertPalette}
        onFillInvertPalette={onFillInvertPalette}
        onStrokeInvertPalette={onStrokeInvertPalette}
        onStrokeMappingChange={onStrokeMappingChange}
        onOpenFillDiscretization={handleOpenFillDiscretization}
      />
    {:else if symbolMode === SymbolMode.PROPORTIONAL || symbolMode === SymbolMode.CLASSES}
      <SymbolModeProportional
        dataFields={dataFields}
        visualization={visualization}
        fillVisualization={fillVisualization}
        symbolMode={symbolMode}
        onSymbolsChange={onSymbolsChange}
        onSymbolPrimitiveChange={onSymbolPrimitiveChange}
        onMappingChange={onMappingChange}
        onFillMappingChange={onFillMappingChange}
        onModesChange={onModesChange}
        onStyleChange={onStyleChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
        onFillClassificationChange={onFillClassificationChange}
        onStrokeClassificationChange={onStrokeClassificationChange}
        onInvertPalette={onInvertPalette}
        onFillInvertPalette={onFillInvertPalette}
        onStrokeInvertPalette={onStrokeInvertPalette}
        onStrokeMappingChange={onStrokeMappingChange}
        onOpenSizeDiscretization={handleOpenDiscretization}
        onOpenFillDiscretization={handleOpenFillDiscretization}
      />
    {:else if symbolMode === SymbolMode.CATEGORIES}
      <SymbolModeCategories
        dataFields={dataFields}
        visualization={visualization}
        onStyleChange={onStyleChange}
        onSymbolsChange={onSymbolsChange}
        onSymbolPrimitiveChange={onSymbolPrimitiveChange}
        onMappingChange={onMappingChange}
        onStrokeMappingChange={onStrokeMappingChange}
        onModesChange={onModesChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
        onStrokeClassificationChange={onStrokeClassificationChange}
        onInvertPalette={onInvertPalette}
        onStrokeInvertPalette={onStrokeInvertPalette}
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
    onClearFilters={onClearFilters}
    onClose={() => {
      filterSectionVisible = false;
    }}
  />
{/if}

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={activeDiscretizationVisualization}
  classification={activeDiscretizationClassification}
  valueColumn={activeDiscretizationValueColumn}
  showBreakpointControls={discretizationTarget === 'fill'}
  role={discretizationTarget === 'fill' ? 'fill' : 'size'}
  sizePreview={activeSizePreview}
  binFillStrategy={activeBinFillStrategy}
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
