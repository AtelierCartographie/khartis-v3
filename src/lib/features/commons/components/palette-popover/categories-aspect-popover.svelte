<script lang="ts">
  import { untrack } from 'svelte';
  import { dragHandle, dragHandleZone } from 'svelte-dnd-action';
  import { Dropdown, TextInput } from 'carbon-components-svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ArrowRight, Close, ChevronDown } from 'carbon-icons-svelte';
  import {
    CATEGORY_SHAPE_CYCLE,
    ShapeType
  } from '$lib/features/commons/constants/visualization.constants';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { portal } from '$lib/features/commons/utils/portal';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';
  import {
    ColorSelector,
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { resolveToolbarWidth } from '$lib/features/commons/utils/toolbar-width.utils';
  import PaletteSuggestions from './palette-suggestions.svelte';
  import SingleColorPreview from './single-color-preview.svelte';
  import PatternPalettePicker from './pattern-palette-picker.svelte';
  import ShapeChipRow from './shape-chip-row.svelte';
  import {
    PALETTE_TYPE,
    type QualitativePreset,
    DEFAULT_QUALITATIVE_PRESET,
    generateCategoricalColorsFromSeed,
    buildShapeSwatchBackground
  } from './palette.constants';
  import type {
    PatternPaletteConfig,
    PatternShape
  } from '$lib/features/commons/constants/pattern.constants';
  import {
    resolveClassPatterns,
    type ClassPattern
  } from '$lib/features/commons/services/pattern-palette.service';
  import {
    DEFAULT_COMMON_ASPECT,
    type CategoriesAspectVariant,
    type CategoriesCommonAspect,
    type CategoryDraft
  } from './categories-aspect-popover.types';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    categories: CategoryDraft[];
    variant?: CategoriesAspectVariant;
    showCommonAspect?: boolean;
    commonAspect?: CategoriesCommonAspect;
    onclose?: () => void;
    onvalidate?: (
      next: CategoryDraft[],
      commonAspect: CategoriesCommonAspect
    ) => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    categories,
    variant = 'symbols-unique',
    showCommonAspect: commonAspectEnabled = true,
    commonAspect,
    onclose,
    onvalidate
  }: Props = $props();

  let popoverRef = $state<HTMLDivElement>();
  let popoverRight = $state(resolveToolbarWidth(globalState.toolbarState));
  let draftCategories = $state<CategoryDraft[]>([]);
  let selectedCategoryId = $state<string | null>(null);
  let draftColorBlindFilter = $state(false);
  let draftQualitativePreset = $state<QualitativePreset>(
    DEFAULT_QUALITATIVE_PRESET
  );
  let draftSuggestionSeedColor = $state<string | undefined>(undefined);
  let draftCommonAspect = $state<CategoriesCommonAspect>({
    ...DEFAULT_COMMON_ASPECT
  });
  let expandedCategoryId = $state<string | null>(null);
  let sortMode = $state<'manual' | 'az' | 'za'>('manual');
  const contextualSurfaceId = createExclusiveContextualSurfaceId(
    'categories-aspect-popover'
  );

  const showSuggestions = $derived(variant !== 'symbols-different-rank');
  const supportsCommonAspect = $derived(
    variant === 'symbols-unique' ||
      variant === 'symbols-different' ||
      variant === 'symbols-different-rank' ||
      variant === 'polygons'
  );
  const showCommonAspectSection = $derived(
    commonAspectEnabled && supportsCommonAspect
  );
  const showCategoryShapePicker = $derived(variant === 'symbols-different');
  const isSymbolsDifferentRank = $derived(variant === 'symbols-different-rank');
  const showPerCategoryAspect = $derived(!isSymbolsDifferentRank);
  const primitiveKind = $derived<'symbols' | 'polygons' | 'lines' | 'texts'>(
    variant === 'polygons'
      ? 'polygons'
      : variant === 'lines'
        ? 'lines'
        : variant === 'texts'
          ? 'texts'
          : 'symbols'
  );
  const showPerCategoryStrokeColor = $derived(
    primitiveKind === 'symbols' &&
      (!draftCommonAspect.stroke || !draftCommonAspect.autoColor)
  );
  const showPerCategoryStrokeWidth = $derived(
    primitiveKind === 'symbols' &&
      (!draftCommonAspect.stroke || !(draftCommonAspect.strokeUnique ?? true))
  );

  // Mirrors MAX_CATEGORICAL_PATTERN_COUNT (map/layers/polygon-pattern-layer.utils.ts): keep both in sync.
  const MAX_PATTERN_PREVIEW_CATEGORIES = 24;
  const showCategoryPattern = $derived(
    primitiveKind === 'polygons' && draftCommonAspect.pattern
  );
  const resolvedPatternConfig = $derived<PatternPaletteConfig>(
    draftCommonAspect.patternConfig ?? DEFAULT_COMMON_ASPECT.patternConfig!
  );
  const categoryPatterns = $derived<ClassPattern[] | null>(
    showCategoryPattern &&
      draftCategories.length > 0 &&
      draftCategories.length <= MAX_PATTERN_PREVIEW_CATEGORIES
      ? resolveClassPatterns(
          draftCategories.length,
          {
            ...resolvedPatternConfig,
            shape: 'line',
            categoryShapes: draftCategories.map(
              (category) => category.patternShape
            )
          },
          'categorical'
        )
      : null
  );

  const shapeChoices = $derived<Array<{ id: ShapeType; label: string }>>([
    { id: ShapeType.CIRCLE, label: m.shape_circle() },
    { id: ShapeType.SQUARE, label: m.shape_square() },
    { id: ShapeType.TRIANGLE, label: m.shape_triangle() },
    { id: ShapeType.DIAMOND, label: m.shape_diamond() },
    { id: ShapeType.CROSS, label: m.shape_cross() },
    { id: ShapeType.STAR, label: m.shape_star() },
    { id: ShapeType.RECTANGLE, label: m.shape_rectangle() }
  ]);
  const sortItems = $derived([
    { id: 'manual', text: m.palette_categories_sort_manual() },
    { id: 'az', text: m.palette_categories_sort_az() },
    { id: 'za', text: m.palette_categories_sort_za() }
  ]);

  const toolbarWidth = $derived(resolveToolbarWidth(globalState.toolbarState));

  const selectedCategory = $derived(
    draftCategories.find((category) => category.id === selectedCategoryId)
  );

  const FLIP_DURATION_MS = 150;
  const MAX_VISIBLE_CATEGORIES = 50;
  const visibleDraftCategories = $derived(
    draftCategories.slice(0, MAX_VISIBLE_CATEGORIES)
  );
  const hiddenCategoryCount = $derived(
    Math.max(0, draftCategories.length - MAX_VISIBLE_CATEGORIES)
  );

  function initDraft() {
    draftCategories = categories.map((category, index) => ({
      ...category,
      shape:
        variant === 'symbols-different'
          ? (category.shape ??
            CATEGORY_SHAPE_CYCLE[index % CATEGORY_SHAPE_CYCLE.length])
          : category.shape
    }));
    selectedCategoryId = draftCategories[0]?.id ?? null;
    expandedCategoryId = showPerCategoryAspect
      ? (draftCategories[0]?.id ?? null)
      : null;
    draftColorBlindFilter = false;
    draftQualitativePreset = DEFAULT_QUALITATIVE_PRESET;
    draftSuggestionSeedColor = draftCategories[0]?.color;
    draftCommonAspect = commonAspect
      ? { ...DEFAULT_COMMON_ASPECT, ...commonAspect }
      : { ...DEFAULT_COMMON_ASPECT };
    sortMode = 'manual';
    popoverRight = toolbarWidth;
  }

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleCancel() {
    handleClose();
  }

  function handleValidate() {
    onvalidate?.(draftCategories, draftCommonAspect);
    open = false;
  }

  function handleCommonAspectChange<K extends keyof CategoriesCommonAspect>(
    key: K,
    value: CategoriesCommonAspect[K]
  ) {
    if (key === 'stroke' && value === false) {
      draftCommonAspect = {
        ...draftCommonAspect,
        stroke: false,
        autoColor: false,
        strokeUnique: false
      };
      return;
    }

    draftCommonAspect = { ...draftCommonAspect, [key]: value };
  }

  function handlePatternConfigChange(config: PatternPaletteConfig) {
    draftCommonAspect = { ...draftCommonAspect, patternConfig: config };
  }

  function handlePatternColorizeChange(colorize: boolean) {
    draftCommonAspect = {
      ...draftCommonAspect,
      patternConfig: { ...resolvedPatternConfig, colorize }
    };
  }

  function applySuggestionPalette(seedHex: string) {
    const nextColors = generateCategoricalColorsFromSeed(
      seedHex,
      draftCategories.length,
      draftQualitativePreset
    );

    draftSuggestionSeedColor = seedHex;
    draftCategories = draftCategories.map((category, index) => ({
      ...category,
      color: nextColors[index] ?? category.color
    }));
  }

  function handleSuggestionColor(hex: string) {
    applySuggestionPalette(hex);
  }

  function applyExactPalette(colors: string[]) {
    if (colors.length === 0) return;

    draftSuggestionSeedColor = colors[0];
    draftCategories = draftCategories.map((category, index) => ({
      ...category,
      color: colors[index % colors.length]
    }));
  }

  function handleQualitativePresetChange(preset: QualitativePreset) {
    draftQualitativePreset = preset;
  }

  function handleCategoryColor(id: string, hex: string) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, color: hex } : category
    );
  }

  function handleCategorySize(id: string, size: number) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, customSize: size } : category
    );
  }

  function handleCategoryStrokeColor(id: string, hex: string) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, strokeColor: hex } : category
    );
  }

  function handleCategoryStrokeWidth(id: string, width: number) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, customStrokeWidth: width } : category
    );
  }

  function handleCategoryShape(id: string, shape: string) {
    draftCategories = draftCategories.map((category) =>
      category.id === id
        ? { ...category, shape: shape as CategoryDraft['shape'] }
        : category
    );
  }

  function handleCategoryPatternShape(id: string, shape: PatternShape) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, patternShape: shape } : category
    );
  }

  function handleCategoryLabel(id: string, label: string) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, label } : category
    );
  }

  function handleCategoryLabelInput(
    id: string,
    fallback: string,
    event: CarbonValueEvent
  ) {
    handleCategoryLabel(id, readCarbonStringValue(event, fallback));
  }

  function handleCategoryToggle(id: string, enabled: boolean) {
    draftCategories = draftCategories.map((category) =>
      category.id === id ? { ...category, enabled } : category
    );
  }

  function selectCategory(id: string) {
    selectedCategoryId = id;
  }

  function toggleCategoryExpand(id: string) {
    expandedCategoryId = expandedCategoryId === id ? null : id;
  }

  function handleCategoryExpand(id: string) {
    selectCategory(id);
    toggleCategoryExpand(id);
  }

  function isNestedPopoverSurface(path: EventTarget[]) {
    return path.some((target) => {
      if (!(target instanceof Element)) return false;
      return (
        target.id === 'khartis-color-picker-dropdown' ||
        target.classList.contains('single-color-dropdown') ||
        target.classList.contains('palette-popover') ||
        target.classList.contains('bx--list-box__menu') ||
        target.classList.contains('bx--list-box__menu-item')
      );
    });
  }

  function handlePopoverOutsideClick(event: CustomEvent) {
    const originalEvent = event.detail?.originalEvent as MouseEvent | undefined;
    const target = originalEvent?.target as Node | undefined;
    if (target && triggerElement?.contains(target)) return;
    if (originalEvent && isNestedPopoverSurface(originalEvent.composedPath())) {
      return;
    }
    handleClose();
  }

  function applyVisibleCategoryOrder(items: CategoryDraft[]) {
    draftCategories = [
      ...items,
      ...draftCategories.slice(Math.min(draftCategories.length, items.length))
    ];
  }

  function handleCategoryListReorder(e: Event) {
    const { items } = (e as CustomEvent<{ items: CategoryDraft[] }>).detail;
    sortMode = 'manual';
    applyVisibleCategoryOrder(items);
  }

  function handleSortSelect(value: string | number) {
    const next =
      value === 'az' || value === 'za' || value === 'manual' ? value : 'manual';
    sortMode = next;
    if (next === 'manual') return;

    draftCategories = [...draftCategories].sort((a, b) =>
      next === 'az'
        ? a.label.localeCompare(b.label)
        : b.label.localeCompare(a.label)
    );
  }

  function categoryShape(category: CategoryDraft): ShapeType {
    if (variant === 'symbols-different') {
      return category.shape ?? ShapeType.CIRCLE;
    }

    return draftCommonAspect.shape ?? ShapeType.CIRCLE;
  }

  function resolveOrderedRankPreviewSize(index: number, total: number): number {
    const clampedBaseSize = Math.min(Math.max(draftCommonAspect.size, 1), 100);
    const minSize = Math.max(1, Math.round(clampedBaseSize * 0.75));
    const maxSize = Math.max(minSize + 1, Math.round(clampedBaseSize * 1.75));

    if (total <= 1) {
      return maxSize;
    }

    return Math.round(minSize + ((maxSize - minSize) * index) / (total - 1));
  }

  function categoryPreviewStyle(
    category: CategoryDraft,
    index: number
  ): string {
    const markerColor =
      isSymbolsDifferentRank && draftCommonAspect.color
        ? draftCommonAspect.color
        : category.color;

    if (variant === 'lines') {
      return `--marker-color: ${markerColor}; --marker-size: 18px;`;
    }
    if (variant === 'texts') {
      return `--marker-color: ${markerColor}; --marker-size: 18px;`;
    }

    const rankSize =
      primitiveKind === 'symbols' &&
      !draftCommonAspect.sizeUnique &&
      category.customSize !== undefined
        ? category.customSize
        : isSymbolsDifferentRank
          ? resolveOrderedRankPreviewSize(index, visibleDraftCategories.length)
          : 14;

    const pattern = categoryPatterns?.[index];
    const patternStyle = pattern
      ? ` background: ${buildShapeSwatchBackground(pattern.type as PatternShape, pattern.fill)};`
      : '';

    return `--marker-color: ${markerColor}; --marker-size: ${rankSize}px;${patternStyle}`;
  }

  $effect(() => {
    if (open) untrack(() => initDraft());
  });

  $effect(() => {
    if (!open) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, handleClose);
  });

  $effect(() => {
    if (!open) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) {
        handleClose();
        return;
      }
      if (e.key === 'Tab' && popoverRef) {
        const focusables = Array.from(
          popoverRef.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });
</script>

{#if open}
  <div use:portal class="categories-aspect-popover-portal">
    <div
      bind:this={popoverRef}
      class="categories-aspect-popover"
      style:right={popoverRight}
      role="dialog"
      aria-label={m.palette_categories_aspect_title()}
      use:clickOutside={{
        enabled: open,
        excludeSelectors: [
          '#khartis-color-picker-dropdown',
          '.single-color-dropdown',
          '.palette-popover',
          '.bx--list-box__menu',
          '.bx--list-box__menu-item'
        ]
      }}
      onoutsideclick={handlePopoverOutsideClick}
    >
      <header class="popover-header">
        <h3>{m.palette_categories_aspect_title()}</h3>
        <IconButton
          kind="ghost"
          size="small"
          icon={Close}
          iconDescription={m.button_cancel()}
          on:click={handleClose}
        />
      </header>

      <div class="popover-content">
        {#if showSuggestions}
          <PaletteSuggestions
            paletteType={PALETTE_TYPE.QUALITATIVE}
            qualitativeMode="categories"
            bind:colorBlindFilter={draftColorBlindFilter}
            selectedPaletteId="__custom__"
            selectedColor={draftSuggestionSeedColor ?? selectedCategory?.color}
            numClasses={draftCategories.length}
            onColorSelect={handleSuggestionColor}
            onPaletteSelect={applyExactPalette}
            onQualitativePresetChange={handleQualitativePresetChange}
          />
        {/if}

        {#if showCommonAspectSection}
          <section class="aspect-section">
            <div class="section-heading">
              <span class="section-heading-text"
                >{m.aspect_common_section()}</span
              >
              <div class="section-heading-line"></div>
            </div>

            {#if isSymbolsDifferentRank}
              <div class="common-stack">
                <div class="field-stack">
                  <span class="field-label">{m.shape()}</span>
                  <select
                    class="common-select"
                    aria-label={m.shape()}
                    value={draftCommonAspect.shape ?? ShapeType.CIRCLE}
                    onchange={(e: Event) =>
                      handleCommonAspectChange(
                        'shape',
                        (e.currentTarget as HTMLSelectElement)
                          .value as ShapeType
                      )}
                  >
                    {#each shapeChoices as shapeChoice (shapeChoice.id)}
                      <option value={shapeChoice.id}>{shapeChoice.label}</option
                      >
                    {/each}
                  </select>
                </div>

                <div class="field-stack">
                  <span class="field-label">{m.color()}</span>
                  <SingleColorPreview
                    color={draftCommonAspect.color ?? '#f287ac'}
                    onchange={(hex) => handleCommonAspectChange('color', hex)}
                  />
                </div>

                <div class="field-stack">
                  <span class="field-label">{m.size()}</span>
                  <SliderWithInput
                    min={1}
                    max={100}
                    value={draftCommonAspect.size}
                    showMinMax
                    inputWidth="96px"
                    onchange={(value) =>
                      handleCommonAspectChange('size', value)}
                  />
                </div>
              </div>
            {:else if primitiveKind === 'symbols'}
              <div class="common-symbols-layout">
                <div class="common-paired-row common-paired-row--with-input">
                  <div class="common-field common-field--toggle">
                    <span class="field-label"
                      >{m.aspect_common_size_unique()}</span
                    >
                    <div class="common-toggle-value">
                      <div class="toggle-control">
                        <Switch
                          toggled={draftCommonAspect.sizeUnique}
                          hideLabel
                          labelText={m.aspect_common_size_unique()}
                          onchange={(value) =>
                            handleCommonAspectChange('sizeUnique', value)}
                        />
                        <span class="toggle-state">
                          {draftCommonAspect.sizeUnique ? m.yes() : m.no()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="common-field common-field--input">
                    <CompactNumberInput
                      value={draftCommonAspect.size}
                      min={1}
                      max={100}
                      width="100%"
                      height="32px"
                      showSteppers={false}
                      disabled={!draftCommonAspect.sizeUnique}
                      ariaLabel={m.aspect_common_size_unique()}
                      onchange={(value) =>
                        handleCommonAspectChange('size', value)}
                    />
                  </div>
                </div>

                <div class="common-divider"></div>

                <div class="common-paired-row">
                  <div class="common-field common-field--toggle">
                    <span class="field-label"
                      >{m.aspect_common_stroke_yesno()}</span
                    >
                    <div class="common-toggle-value">
                      <div class="toggle-control">
                        <Switch
                          toggled={draftCommonAspect.stroke}
                          hideLabel
                          labelText={m.aspect_common_stroke_yesno()}
                          onchange={(value) =>
                            handleCommonAspectChange('stroke', value)}
                        />
                        <span class="toggle-state">
                          {draftCommonAspect.stroke ? m.yes() : m.no()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="common-field common-field--toggle">
                    <span class="field-label"
                      >{m.aspect_common_auto_color()}</span
                    >
                    <div class="common-toggle-value">
                      <div class="toggle-control">
                        <Switch
                          toggled={draftCommonAspect.autoColor}
                          hideLabel
                          labelText={m.aspect_common_auto_color()}
                          disabled={!draftCommonAspect.stroke}
                          onchange={(value) =>
                            handleCommonAspectChange('autoColor', value)}
                        />
                        <span class="toggle-state">
                          {draftCommonAspect.autoColor ? m.yes() : m.no()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="common-paired-row common-paired-row--with-input">
                  <div class="common-field common-field--toggle">
                    <span class="field-label"
                      >{m.aspect_common_stroke_unique()}</span
                    >
                    <div class="common-toggle-value">
                      <div class="toggle-control">
                        <Switch
                          toggled={draftCommonAspect.strokeUnique ?? true}
                          hideLabel
                          labelText={m.aspect_common_stroke_unique()}
                          disabled={!draftCommonAspect.stroke}
                          onchange={(value) =>
                            handleCommonAspectChange('strokeUnique', value)}
                        />
                        <span class="toggle-state">
                          {(draftCommonAspect.strokeUnique ?? true)
                            ? m.yes()
                            : m.no()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="common-field common-field--input">
                    <CompactNumberInput
                      value={Math.max(1, draftCommonAspect.strokeSize)}
                      min={1}
                      max={20}
                      width="100%"
                      height="32px"
                      showSteppers={false}
                      disabled={!draftCommonAspect.stroke ||
                        !(draftCommonAspect.strokeUnique ?? true)}
                      ariaLabel={m.aspect_common_stroke_unique()}
                      onchange={(value) =>
                        handleCommonAspectChange('strokeSize', value)}
                    />
                  </div>
                </div>

                <div class="common-divider"></div>

                <div
                  class="common-field common-field--toggle common-field--full"
                >
                  <span class="field-label">{m.aspect_common_pattern()}</span>
                  <div class="common-toggle-value">
                    <div class="toggle-control">
                      <Switch
                        toggled={draftCommonAspect.pattern}
                        hideLabel
                        labelText={m.aspect_common_pattern()}
                        onchange={(value) =>
                          handleCommonAspectChange('pattern', value)}
                      />
                      <span class="toggle-state">
                        {draftCommonAspect.pattern ? m.yes() : m.no()}
                      </span>
                    </div>
                  </div>
                </div>
                {#if draftCommonAspect.pattern}
                  <div class="common-field--full">
                    <PatternPalettePicker
                      config={resolvedPatternConfig}
                      onchange={handlePatternConfigChange}
                    />
                  </div>
                  <div class="common-field--full">
                    <ToggleWithLabel
                      label={m.pattern_colorize()}
                      toggled={resolvedPatternConfig.colorize ?? false}
                      ontoggle={handlePatternColorizeChange}
                    />
                  </div>
                {/if}
              </div>
            {:else if primitiveKind === 'polygons'}
              <div class="common-grid">
                <div class="common-grid-row common-grid-row--full">
                  <span class="field-label">{m.aspect_common_pattern()}</span>
                  <div class="toggle-control">
                    <Switch
                      toggled={draftCommonAspect.pattern}
                      hideLabel
                      labelText={m.aspect_common_pattern()}
                      onchange={(value) =>
                        handleCommonAspectChange('pattern', value)}
                    />
                    <span class="toggle-state">
                      {draftCommonAspect.pattern ? m.yes() : m.no()}
                    </span>
                  </div>
                </div>
                {#if draftCommonAspect.pattern}
                  <div class="common-grid-row common-grid-row--full">
                    <ColorSelector
                      label={m.color()}
                      value={resolvedPatternConfig.color ?? '#000000'}
                      onchange={(color) =>
                        handlePatternConfigChange({
                          ...resolvedPatternConfig,
                          color
                        })}
                    />
                    <ToggleWithLabel
                      label={m.pattern_colorize()}
                      toggled={resolvedPatternConfig.colorize ?? false}
                      ontoggle={handlePatternColorizeChange}
                    />
                  </div>
                  <div class="common-grid-row common-grid-row--full">
                    <SliderWithInput
                      label={m.pattern_scale()}
                      min={1}
                      max={30}
                      step={1}
                      value={Math.round(
                        (resolvedPatternConfig.scale ?? 1) * 10
                      )}
                      onchange={(value) =>
                        handlePatternConfigChange({
                          ...resolvedPatternConfig,
                          scale: value / 10
                        })}
                    />
                  </div>
                {/if}
              </div>
            {/if}
          </section>
        {/if}

        <section class="aspect-section">
          <div class="section-heading">
            <span class="section-heading-text">
              {m.palette_categories_custom_section()}
            </span>
            <div class="section-heading-line"></div>
          </div>

          <div class="field-stack">
            <span class="field-label">{m.palette_categories_sort()}</span>
            <Dropdown
              items={sortItems}
              selectedId={sortMode}
              on:select={(e) => handleSortSelect(e.detail.selectedId)}
              type="default"
            />
          </div>

          <div class="field-stack">
            <p class="list-label">{m.palette_categories_list_label()}</p>
            <ul
              class="category-list"
              use:dragHandleZone={{
                items: visibleDraftCategories,
                flipDurationMs: FLIP_DURATION_MS,
                dropTargetStyle: {},
                useCursorForDetection: true
              }}
              onconsider={handleCategoryListReorder}
              onfinalize={handleCategoryListReorder}
            >
              {#each visibleDraftCategories as category, index (category.id)}
                <li
                  class="category-item"
                  class:category-item--disabled={!category.enabled}
                >
                  <div class="category-header">
                    <div
                      class="drag-handle"
                      use:dragHandle
                      aria-label={`${m.palette_categories_sort_manual()} ${category.label}`}
                    >
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>

                    <div
                      class="category-marker"
                      data-kind={primitiveKind}
                      data-shape={categoryShape(category)}
                      class:is-ranked={isSymbolsDifferentRank}
                      style={categoryPreviewStyle(category, index)}
                    >
                      {#if primitiveKind === 'texts'}
                        T
                      {/if}
                    </div>

                    <div class="category-label-input">
                      <TextInput
                        hideLabel
                        labelText={m.palette_categories_list_label()}
                        size="sm"
                        value={category.label}
                        on:focus={() => selectCategory(category.id)}
                        on:input={(event) =>
                          handleCategoryLabelInput(
                            category.id,
                            category.label,
                            event
                          )}
                      />
                    </div>

                    <div class="toggle-only-control">
                      <Switch
                        toggled={category.enabled}
                        hideLabel
                        labelText={category.label}
                        onchange={(value) =>
                          handleCategoryToggle(category.id, value)}
                      />
                    </div>
                  </div>

                  {#if showPerCategoryAspect}
                    <button
                      type="button"
                      class="category-expand-button"
                      onclick={() => handleCategoryExpand(category.id)}
                      aria-expanded={expandedCategoryId === category.id}
                    >
                      <ChevronDown
                        size={16}
                        class={expandedCategoryId === category.id
                          ? 'rotated'
                          : undefined}
                      />
                      <span>{m.per_category_aspect()}</span>
                    </button>

                    {#if expandedCategoryId === category.id}
                      <div class="category-aspect-body">
                        {#if showCategoryShapePicker}
                          <div class="field-stack">
                            <span class="field-label"
                              >{m.per_category_shape()}</span
                            >
                            <select
                              class="common-select"
                              aria-label={m.per_category_shape()}
                              value={category.shape ?? ShapeType.CIRCLE}
                              onchange={(e: Event) =>
                                handleCategoryShape(
                                  category.id,
                                  (e.currentTarget as HTMLSelectElement).value
                                )}
                            >
                              {#each shapeChoices as shapeChoice (shapeChoice.id)}
                                <option value={shapeChoice.id}>
                                  {shapeChoice.label}
                                </option>
                              {/each}
                            </select>
                          </div>
                        {/if}

                        <div class="field-stack">
                          <span class="field-label"
                            >{m.per_category_color()}</span
                          >
                          <SingleColorPreview
                            color={category.color}
                            onchange={(hex) =>
                              handleCategoryColor(category.id, hex)}
                          />
                        </div>

                        {#if showCategoryPattern && categoryPatterns}
                          <div class="field-stack">
                            <span class="field-label">{m.pattern_shape()}</span>
                            <ShapeChipRow
                              value={categoryPatterns[index]?.type as
                                PatternShape | undefined}
                              onselect={(shape) =>
                                handleCategoryPatternShape(category.id, shape)}
                            />
                          </div>
                        {/if}

                        {#if primitiveKind === 'symbols' && !draftCommonAspect.sizeUnique}
                          <div class="field-stack">
                            <span class="field-label"
                              >{m.per_category_size()}</span
                            >
                            <CompactNumberInput
                              value={category.customSize ??
                                draftCommonAspect.size}
                              min={1}
                              max={100}
                              width="100%"
                              height="32px"
                              showSteppers={false}
                              ariaLabel={m.per_category_size()}
                              onchange={(value) =>
                                handleCategorySize(category.id, value)}
                            />
                          </div>
                        {/if}

                        {#if showPerCategoryStrokeColor}
                          <div class="field-stack">
                            <span class="field-label"
                              >{m.per_category_stroke_color()}</span
                            >
                            <SingleColorPreview
                              color={category.strokeColor ?? '#000000'}
                              onchange={(hex) =>
                                handleCategoryStrokeColor(category.id, hex)}
                            />
                          </div>
                        {/if}

                        {#if showPerCategoryStrokeWidth}
                          <div class="field-stack">
                            <span class="field-label"
                              >{m.per_category_stroke_width()}</span
                            >
                            <CompactNumberInput
                              value={category.customStrokeWidth ??
                                draftCommonAspect.strokeSize}
                              min={1}
                              max={20}
                              width="100%"
                              height="32px"
                              showSteppers={false}
                              ariaLabel={m.per_category_stroke_width()}
                              onchange={(value) =>
                                handleCategoryStrokeWidth(category.id, value)}
                            />
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
            {#if hiddenCategoryCount > 0}
              <p class="hidden-count-note">
                {m.categories_hidden_count({ count: hiddenCategoryCount })}
              </p>
            {/if}
          </div>
        </section>
      </div>

      <div class="popover-footer-wrap">
        <div class="popover-divider"></div>
        <footer class="popover-footer">
          <Button
            class="khartis-dialog-close-action"
            kind="secondary"
            size="small"
            on:click={handleCancel}
          >
            {m.button_cancel()}
          </Button>
          <Button
            class="khartis-dialog-action"
            kind="secondary"
            size="small"
            icon={ArrowRight}
            on:click={handleValidate}
          >
            {m.button_validate()}
          </Button>
        </footer>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  :global(.categories-aspect-popover-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.categories-aspect-popover-portal *) {
    pointer-events: auto;
  }

  :global(.categories-aspect-popover) {
    position: fixed;
    right: 50vw;
    top: 50%;
    transform: translateY(-50%);
    width: 320px;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    background: var(--cds-background, #ffffff);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.15);
    z-index: var(--z-popover);
    overflow: hidden;
  }

  @media (max-width: 1023px) {
    :global(.categories-aspect-popover) {
      right: 0 !important;
      left: 0;
      top: auto;
      bottom: calc(
        60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03) + 48px +
          var(--cds-spacing-03)
      );
      transform: none;
      width: 100vw;
      max-height: calc(
        100dvh - var(--cds-header-height, 48px) -
          60px - env(safe-area-inset-bottom, 0px) - var(--cds-spacing-03) -
          48px - var(--cds-spacing-03) - var(--cds-spacing-05)
      );
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    }
  }

  .popover-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px 8px 16px;
    flex-shrink: 0;

    h3 {
      flex: 1;
      margin: 0;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 16px;
      font-weight: 600;
      line-height: 24px;
      color: var(--cds-text-primary, #161616);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: 32px;
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 8px;
  }

  .aspect-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
  }

  .section-heading-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
    white-space: nowrap;
  }

  .section-heading-line {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  .field-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label,
  .list-label {
    margin: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .common-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .common-symbols-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .common-paired-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    width: 100%;
  }

  .common-paired-row--with-input {
    align-items: flex-end;
  }

  .common-field {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .common-field--input {
    justify-content: flex-end;
    min-width: 64px;
  }

  .common-field--full {
    width: 100%;
  }

  .common-toggle-value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 18px;
  }

  .common-divider {
    width: 100%;
    height: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  .common-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .common-grid-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .common-grid-row--full {
    grid-column: 1 / -1;
  }

  .toggle-control,
  .toggle-only-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .toggle-state {
    min-width: 20px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
  }

  .common-select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 32px;
    padding: 7px 16px;
    background: var(--cds-field-01, #f4f4f4);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
  }

  .common-select {
    appearance: none;
    background-image:
      linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position:
      calc(100% - 18px) 13px,
      calc(100% - 13px) 13px;
    background-size:
      5px 5px,
      5px 5px;
    background-repeat: no-repeat;
    padding-right: 32px;
  }

  .category-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hidden-count-note {
    margin: 8px 0 0;
    padding: 8px 12px;
    background: var(--cds-layer-01, #f4f4f4);
    border: 1px dashed var(--cds-border-subtle-01, #c6c6c6);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-style: italic;
    line-height: 16px;
    color: var(--cds-text-secondary, #525252);
  }

  .category-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: var(--cds-layer-01, #f4f4f4);
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .category-item--disabled {
    opacity: 0.56;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .drag-handle {
    width: 16px;
    display: grid;
    grid-template-columns: repeat(2, 2px);
    grid-auto-rows: 2px;
    gap: 2px;
    justify-content: center;
    align-content: center;
    flex-shrink: 0;
    cursor: grab;

    span {
      display: block;
      width: 2px;
      height: 2px;
      border-radius: 50%;
      background: var(--cds-icon-secondary, #525252);
    }
  }

  .category-marker {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--marker-size, 14px);
    height: var(--marker-size, 14px);
    flex-shrink: 0;
    color: var(--marker-color, #f287ac);
    background: var(--marker-color, #f287ac);
    border-radius: 50%;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
  }

  .category-marker[data-kind='polygons'] {
    border-radius: 0;
  }

  .category-marker[data-kind='lines'] {
    height: 4px;
    border-radius: 999px;
    width: 18px;
  }

  .category-marker[data-kind='texts'] {
    width: auto;
    height: auto;
    background: transparent;
  }

  .category-marker[data-shape='square'] {
    border-radius: 0;
  }

  .category-marker[data-shape='triangle'] {
    clip-path: polygon(50% 0, 0 100%, 100% 100%);
    border-radius: 0;
  }

  .category-marker[data-shape='diamond'] {
    border-radius: 0;
    transform: rotate(45deg) scale(0.8);
  }

  .category-marker[data-shape='rectangle'] {
    width: calc(var(--marker-size, 14px) * 1.3);
    border-radius: 0;
  }

  .category-marker[data-shape='cross'] {
    background: transparent;
  }

  .category-marker[data-shape='cross']::before,
  .category-marker[data-shape='cross']::after {
    content: '';
    position: absolute;
    background: var(--marker-color, #f287ac);
  }

  .category-marker[data-shape='cross']::before {
    width: calc(var(--marker-size, 14px) * 0.2);
    height: 100%;
  }

  .category-marker[data-shape='cross']::after {
    width: 100%;
    height: calc(var(--marker-size, 14px) * 0.2);
  }

  .category-marker[data-shape='star'] {
    clip-path: polygon(
      50% 0,
      61% 35%,
      98% 35%,
      68% 57%,
      79% 91%,
      50% 70%,
      21% 91%,
      32% 57%,
      2% 35%,
      39% 35%
    );
    border-radius: 0;
  }

  .category-label-input {
    flex: 1;
    min-width: 0;
  }

  .category-label-input :global(.bx--text-input) {
    height: 32px;
    padding: 7px 16px;
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    background: var(--cds-field-02, #ffffff);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
  }

  .category-label-input :global(.bx--text-input:focus) {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
  }

  .category-expand-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0 16px 0 22px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
    text-align: left;
  }

  .category-expand-button :global(svg) {
    flex-shrink: 0;
    color: var(--cds-icon-secondary, #525252);
    transition: transform 0.15s ease;
  }

  .category-expand-button :global(svg.rotated) {
    transform: rotate(180deg);
  }

  .category-aspect-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-left: 22px;
  }

  .popover-footer-wrap {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .popover-divider {
    height: 8px;
    border-top: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .popover-footer {
    display: flex;
    gap: 8px;
    padding: 16px;
    flex-shrink: 0;

    :global(.bx--btn) {
      flex: 1;
    }
  }

  .toggle-control :global(.kh-switch-native),
  .toggle-only-control :global(.kh-switch-native) {
    gap: 0;
  }
</style>
