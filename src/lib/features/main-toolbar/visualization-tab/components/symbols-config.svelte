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
    PrimitiveFilterType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import { SectionHeading, InfoPopover } from './shared';
  import {
    SymbolModeUnique,
    SymbolModeProportional,
    SymbolModeCategories
  } from './symbols';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onSymbolsChange?: (
      updates: Partial<VisualizationConfig['symbols']>
    ) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
  }

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onMappingChange,
    onMissingDataChange,
    onClassificationChange,
    onInvertPalette,
    onToggleVisibility
  }: Props = $props();

  let discretizationModalOpen = $state(false);
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
    if (visualization?.modes) {
      symbolMode = visualization.modes.symbol ?? SymbolMode.UNIQUE;
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
    symbolMode = modes[index] || SymbolMode.UNIQUE;
    onModesChange?.({ symbol: symbolMode });
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
</script>

<ExpandableSection
  title={m.symbols_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.symbols_section_info()} />
  {/snippet}

  <div class="symbols-config">
    <SectionHeading title={m.size_and_shape()} />

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
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {:else if symbolMode === SymbolMode.PROPORTIONAL || symbolMode === SymbolMode.CLASSES}
      <SymbolModeProportional
        dataFields={dataFields}
        visualization={visualization}
        symbolMode={symbolMode}
        onSymbolsChange={onSymbolsChange}
        onMappingChange={onMappingChange}
        onModesChange={onModesChange}
        onStyleChange={onStyleChange}
        onMissingDataChange={onMissingDataChange}
        onClassificationChange={onClassificationChange}
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
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {/if}
  </div>
</ExpandableSection>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
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
