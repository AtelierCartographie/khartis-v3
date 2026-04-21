<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { ArrowsHorizontal, ChevronDown } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import { computeDivergingSplit } from '$lib/features/commons/services/classification.service';
  import PalettePopover from './palette-popover.svelte';
  import PaletteDropdown from './palette-dropdown.svelte';
  import CategoriesAspectPopover from './categories-aspect-popover.svelte';
  import type {
    CategoriesAspectVariant,
    CategoriesCommonAspect,
    CategoryDraft
  } from './categories-aspect-popover.types';
  import { DEFAULT_COMMON_ASPECT } from './categories-aspect-popover.types';
  import type {
    Palette,
    PaletteType,
    PatternParams
  } from './palette.constants';
  import { normalizePaletteId } from './palette.constants';
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
    disabledCategoryLabels?: string[];
    categoriesCommonAspect?: CategoriesCommonAspect;
    categoriesPopoverOpen?: boolean;
    classification?: ClassificationConfig;
    onexpand?: () => void;
    oninvert?: () => void;
    onselect?: (palette: Palette) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onCategoriesCommonAspectChange?: (
      commonAspect: CategoriesCommonAspect,
      next: CategoryDraft[]
    ) => void;
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
    disabledCategoryLabels = [],
    categoriesCommonAspect = DEFAULT_COMMON_ASPECT,
    categoriesPopoverOpen = $bindable(false),
    classification,
    onexpand,
    oninvert,
    onselect,
    onClassificationChange,
    onCategoriesCommonAspectChange
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
  const normalizedSelectedPaletteId = $derived(
    normalizePaletteId(selectedPaletteId) ?? selectedPaletteId
  );
  const resolvedClassCount = $derived(
    classification?.numClasses ??
      classification?.classes ??
      (colors.length || 5)
  );
  const divergingSplit = $derived.by(() => {
    if (
      paletteType !== 'diverging' ||
      classification?.breakpointValue == null ||
      resolvedClassCount <= 0
    ) {
      return undefined;
    }

    return computeDivergingSplit(
      resolvedClassCount,
      classification?.breaks ?? [],
      classification.breakpointValue
    );
  });

  const categoryDrafts = $derived<CategoryDraft[]>(
    colors.map((color, i) => {
      const label =
        categoryLabels[i] ?? m.palette_category_default_label({ index: i + 1 });

      return {
        id: String(i),
        label,
        color,
        enabled: !disabledCategoryLabels.includes(label)
      };
    })
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

  function resolveValidatedCategoryColors(
    next: CategoryDraft[],
    commonAspect: CategoriesCommonAspect
  ): string[] {
    if (categoriesVariant === 'symbols-different-rank') {
      const color =
        commonAspect.color ??
        next[0]?.color ??
        colors[0] ??
        DEFAULT_COMMON_ASPECT.color ??
        '#f287ac';
      return next.map(() => color);
    }

    return next.map((category) => category.color);
  }

  function handleCategoriesValidateWithAspect(
    next: CategoryDraft[],
    commonAspect: CategoriesCommonAspect
  ) {
    handleCategoriesValidate(next, commonAspect);
  }

  function handleCategoriesValidate(
    next: CategoryDraft[],
    commonAspect: CategoriesCommonAspect
  ) {
    const resolvedColors = resolveValidatedCategoryColors(next, commonAspect);
    const normalizedCategories = next.map((category, index) => ({
      ...category,
      color: resolvedColors[index] ?? category.color,
      shape:
        categoriesVariant === 'symbols-different' ? category.shape : undefined
    }));
    const categoryShapes =
      categoriesVariant === 'symbols-different' &&
      normalizedCategories.some((category) => category.shape)
        ? normalizedCategories
            .map((category) => category.shape)
            .filter(
              (shape): shape is NonNullable<typeof shape> => shape !== undefined
            )
        : undefined;
    const paletteId =
      resolvedColors.length === colors.length &&
      resolvedColors.every((color, index) => color === colors[index])
        ? (selectedPaletteId ?? '__custom__')
        : '__custom__';

    onClassificationChange?.({
      colors: resolvedColors,
      labels: normalizedCategories.map((category) => category.label),
      disabledLabels: normalizedCategories
        .filter((category) => !category.enabled)
        .map((category) => category.label),
      categoryShapes,
      paletteId,
      inverted: false,
      patternId: undefined,
      patternParams: undefined
    });
    onCategoriesCommonAspectChange?.(commonAspect, normalizedCategories);
    categoriesPopoverOpen = false;
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
  selectedPaletteId={normalizedSelectedPaletteId}
  paletteType={paletteType}
  colorBlindFilter={colorBlindFilter}
  numClasses={resolvedClassCount}
  previewCount={dropdownPreviewCount}
  divergingSplit={divergingSplit}
  onclose={handleDropdownClose}
  onselect={handleDropdownSelect}
  oncustomize={handleCustomize}
/>

<PalettePopover
  bind:open={popoverOpen}
  triggerElement={triggerRef}
  currentColors={colors}
  currentInverted={inverted}
  selectedPaletteId={normalizedSelectedPaletteId}
  bind:paletteType={paletteType}
  bind:colorBlindFilter={colorBlindFilter}
  numClasses={resolvedClassCount}
  divergingSplit={divergingSplit}
  onclose={handlePopoverClose}
  onvalidate={handlePopoverValidate}
/>

<CategoriesAspectPopover
  bind:open={categoriesPopoverOpen}
  triggerElement={triggerRef}
  categories={categoryDrafts}
  variant={categoriesVariant}
  commonAspect={categoriesCommonAspect}
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
