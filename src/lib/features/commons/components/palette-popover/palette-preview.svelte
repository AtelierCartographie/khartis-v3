<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { ArrowsHorizontal, ChevronDown } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import PalettePopover from './palette-popover.svelte';
  import PaletteDropdown from './palette-dropdown.svelte';
  import CategoriesAspectPopover from './categories-aspect-popover.svelte';
  import type {
    CategoriesAspectVariant,
    CategoryDraft
  } from './categories-aspect-popover.types';
  import type {
    Palette,
    PaletteType,
    PatternParams
  } from './palette.constants';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    label?: string;
    colors: string[];
    selectedPaletteId?: string;
    inverted?: boolean;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    showInvertButton?: boolean;
    categoriesMode?: boolean;
    categoriesVariant?: CategoriesAspectVariant;
    categoryLabels?: string[];
    categoriesPopoverOpen?: boolean;
    onexpand?: () => void;
    oninvert?: () => void;
    onselect?: (palette: Palette) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  }

  let {
    label,
    colors,
    selectedPaletteId = 'blues',
    inverted = false,
    paletteType = $bindable<PaletteType>('sequential'),
    colorBlindFilter = $bindable(false),
    showInvertButton = true,
    categoriesMode = false,
    categoriesVariant = 'symbols-unique',
    categoryLabels = [],
    categoriesPopoverOpen = $bindable(false),
    onexpand,
    oninvert,
    onselect,
    onClassificationChange
  }: Props = $props();

  let dropdownOpen = $state(false);
  let popoverOpen = $state(false);
  let triggerRef = $state<HTMLDivElement>();

  const MAX_PREVIEW_SWATCHES = 20;
  const displayColors = $derived.by(() => {
    if (colors.length <= MAX_PREVIEW_SWATCHES) return colors;
    const step = colors.length / MAX_PREVIEW_SWATCHES;
    return Array.from(
      { length: MAX_PREVIEW_SWATCHES },
      (_, i) => colors[Math.min(colors.length - 1, Math.round(i * step))]
    );
  });
  const dropdownPreviewCount = $derived(
    colors.length > 0 ? Math.min(colors.length, MAX_PREVIEW_SWATCHES) : 5
  );

  const categoryDrafts = $derived<CategoryDraft[]>(
    colors.map((color, i) => ({
      id: String(i),
      label:
        categoryLabels[i] ?? m.palette_category_default_label({ index: i + 1 }),
      color,
      enabled: true
    }))
  );

  function handleClick() {
    dropdownOpen = !dropdownOpen;
    onexpand?.();
  }

  function handleInvert(e: MouseEvent) {
    e.stopPropagation();
    oninvert?.();
  }

  function handleDropdownSelect(palette: Palette, newColors: string[]) {
    onselect?.(palette);
    onClassificationChange?.({
      colors: newColors,
      paletteId: palette.id,
      inverted: false,
      patternId: palette.patternId ?? undefined,
      patternParams: undefined
    });
    dropdownOpen = false;
  }

  function handleCustomize() {
    dropdownOpen = false;
    if (categoriesMode) {
      categoriesPopoverOpen = true;
    } else {
      popoverOpen = true;
    }
  }

  function handleDropdownClose() {
    dropdownOpen = false;
  }

  function handleCategoriesValidate(next: CategoryDraft[]) {
    const categoryShapes = next.some((category) => category.shape)
      ? next
          .map((category) => category.shape)
          .filter(
            (shape): shape is NonNullable<typeof shape> => shape !== undefined
          )
      : undefined;

    onClassificationChange?.({
      colors: next.map((c) => c.color),
      labels: next.map((c) => c.label),
      categoryShapes,
      paletteId: '__custom__',
      inverted: false,
      patternId: undefined,
      patternParams: undefined
    });
    categoriesPopoverOpen = false;
  }

  function handleCategoriesValidateWithAspect(next: CategoryDraft[]) {
    handleCategoriesValidate(next);
  }

  function handleCategoriesClose() {
    categoriesPopoverOpen = false;
  }

  function handlePopoverValidate(
    palette: Palette | undefined,
    newColors: string[],
    nextInverted: boolean,
    patternParams?: PatternParams
  ) {
    if (palette) {
      onselect?.(palette);
    }
    const changes: Parameters<NonNullable<typeof onClassificationChange>>[0] = {
      colors: newColors,
      inverted: nextInverted,
      paletteId: palette?.id ?? '__custom__',
      patternId: palette?.patternId ?? undefined,
      patternParams: palette?.patternId ? patternParams : undefined
    };
    onClassificationChange?.(changes);
    popoverOpen = false;
  }

  function handlePopoverClose() {
    popoverOpen = false;
  }
</script>

<div class="palette-preview-wrapper">
  {#if label}
    <span class="field-label">{label}</span>
  {/if}
  <div class="palette-trigger" bind:this={triggerRef}>
    <button
      type="button"
      class="palette-main"
      onclick={handleClick}
      aria-label={m.color_palette()}
      aria-expanded={dropdownOpen}
    >
      <div class="palette-preview">
        {#each displayColors as color, i (i)}
          <div
            class="palette-color"
            style="background-color: {color}"
            title={color}
          ></div>
        {/each}
      </div>
      <ChevronDown size={16} />
    </button>
    {#if showInvertButton}
      <IconButton
        kind="ghost"
        size="small"
        icon={ArrowsHorizontal}
        iconDescription={m.invert_palette_tooltip()}
        on:click={handleInvert}
      />
    {/if}
  </div>
</div>

<PaletteDropdown
  bind:open={dropdownOpen}
  triggerElement={triggerRef}
  selectedPaletteId={selectedPaletteId}
  paletteType={paletteType}
  colorBlindFilter={colorBlindFilter}
  numClasses={colors.length || 5}
  previewCount={dropdownPreviewCount}
  onclose={handleDropdownClose}
  onselect={handleDropdownSelect}
  oncustomize={handleCustomize}
/>

<PalettePopover
  bind:open={popoverOpen}
  triggerElement={triggerRef}
  currentColors={colors}
  currentInverted={inverted}
  selectedPaletteId={selectedPaletteId}
  bind:paletteType={paletteType}
  bind:colorBlindFilter={colorBlindFilter}
  numClasses={colors.length || 5}
  onclose={handlePopoverClose}
  onvalidate={handlePopoverValidate}
/>

<CategoriesAspectPopover
  bind:open={categoriesPopoverOpen}
  triggerElement={triggerRef}
  categories={categoryDrafts}
  variant={categoriesVariant}
  onclose={handleCategoriesClose}
  onvalidate={handleCategoriesValidateWithAspect}
/>

<style lang="scss">
  .palette-preview-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .palette-trigger {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .palette-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    min-width: 0;
    height: 32px;
    padding: 7px 16px;
    background: var(--cds-field-01, #f4f4f4);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    cursor: pointer;

    &:hover {
      background: var(--cds-field-hover-01, #e8e8e8);
    }
  }

  .palette-preview {
    display: flex;
    flex: 1;
    min-width: 0;
    height: 18px;
    overflow: hidden;
    border: 1px solid var(--cds-icon-on-color, #ffffff);
  }

  .palette-color {
    flex: 1;
    min-width: 0;
    height: 100%;
  }

  .palette-main :global(svg) {
    flex-shrink: 0;
    color: var(--cds-icon-primary, #161616);
  }

  .palette-trigger :global(.bx--btn--ghost.bx--btn--sm) {
    min-width: 32px;
    min-height: 32px;
    padding: 8px;
  }
</style>
