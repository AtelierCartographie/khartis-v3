<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Category,
    ChartBubble,
    CircleFilled,
    Filter,
    Tag
  } from 'carbon-icons-svelte';
  import { SymbolMode } from '../../constants';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { SectionTitle } from './shared';
  import DiscretizationModal from './discretization-modal.svelte';
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
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onInvertPalette?: () => void;
  }

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onMissingDataChange,
    onClassificationChange,
    onInvertPalette
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let symbolMode = $state<SymbolMode>(SymbolMode.UNIQUE);

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
  defaultOpen
  showToggle
  toggleChecked={true}
>
  {#snippet icon()}
    <button type="button" class="filter-btn" aria-label={m.filter_data()}>
      <Filter size={16} />
    </button>
  {/snippet}

  <div class="symbols-config">
    <SectionTitle title={m.size_and_shape()} />

    <div class="field-group">
      <span class="field-label">{m.symbols_title()}</span>
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
        onMissingDataChange={onMissingDataChange}
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {:else if symbolMode === SymbolMode.PROPORTIONAL || symbolMode === SymbolMode.CLASSES}
      <SymbolModeProportional
        dataFields={dataFields}
        visualization={visualization}
        symbolMode={symbolMode}
        onSymbolsChange={onSymbolsChange}
        onMissingDataChange={onMissingDataChange}
        onOpenDiscretization={handleOpenDiscretization}
      />
    {:else if symbolMode === SymbolMode.CATEGORIES}
      <SymbolModeCategories
        dataFields={dataFields}
        visualization={visualization}
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
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);

    &:hover {
      background: var(--cds-hover-ui);
    }
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
