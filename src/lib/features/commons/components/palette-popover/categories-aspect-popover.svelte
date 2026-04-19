<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ArrowRight, Close, ChevronDown } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import PaletteSuggestions from './palette-suggestions.svelte';
  import SingleColorPreview from './single-color-preview.svelte';
  import { PALETTE_TYPE, type Palette } from './palette.constants';
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
    commonAspect,
    onclose,
    onvalidate
  }: Props = $props();

  let popoverRef = $state<HTMLDivElement>();
  let popoverRight = $state('50vw');
  let draftCategories = $state<CategoryDraft[]>([]);
  let selectedCategoryId = $state<string | null>(null);
  let draftColorBlindFilter = $state(false);
  let draftCommonAspect = $state<CategoriesCommonAspect>({
    ...DEFAULT_COMMON_ASPECT
  });

  const showCommonAspect = $derived(variant !== 'symbols-different-rank');
  const showCategoryShapePicker = $derived(variant === 'symbols-different');
  const primitiveKind = $derived<'symbols' | 'polygons' | 'lines' | 'texts'>(
    variant === 'polygons'
      ? 'polygons'
      : variant === 'lines'
        ? 'lines'
        : variant === 'texts'
          ? 'texts'
          : 'symbols'
  );
  let expandedCategoryId = $state<string | null>(null);

  function toggleCategoryExpand(id: string) {
    expandedCategoryId = expandedCategoryId === id ? null : id;
  }

  function handleCategoryShape(id: string, shape: string) {
    draftCategories = draftCategories.map((c) =>
      c.id === id ? { ...c, shape: shape as CategoryDraft['shape'] } : c
    );
  }

  const shapeChoices = $derived<Array<{ id: string; label: string }>>([
    { id: 'circle', label: m.shape_circle() },
    { id: 'square', label: m.shape_square() },
    { id: 'triangle', label: m.shape_triangle() },
    { id: 'diamond', label: m.shape_diamond() },
    { id: 'cross', label: m.shape_cross() },
    { id: 'star', label: m.shape_star() },
    { id: 'rectangle', label: m.shape_rectangle() }
  ]);

  const toolbarWidth = $derived.by(() => {
    switch (globalState.toolbarState) {
      case ToolbarState.Collapsed:
        return '50px';
      case ToolbarState.Compact:
        return '434px';
      default:
        return '50vw';
    }
  });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  function initDraft() {
    draftCategories = categories.map((c) => ({ ...c }));
    selectedCategoryId = draftCategories[0]?.id ?? null;
    draftColorBlindFilter = false;
    draftCommonAspect = commonAspect
      ? { ...commonAspect }
      : { ...DEFAULT_COMMON_ASPECT };
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
    draftCommonAspect = { ...draftCommonAspect, [key]: value };
  }

  function handleSuggestionColor(hex: string) {
    if (!selectedCategoryId) return;
    draftCategories = draftCategories.map((c) =>
      c.id === selectedCategoryId ? { ...c, color: hex } : c
    );
  }

  function handleCategoryColor(id: string, hex: string) {
    draftCategories = draftCategories.map((c) =>
      c.id === id ? { ...c, color: hex } : c
    );
  }

  function handleCategoryLabel(id: string, label: string) {
    draftCategories = draftCategories.map((c) =>
      c.id === id ? { ...c, label } : c
    );
  }

  function handleCategoryToggle(id: string, enabled: boolean) {
    draftCategories = draftCategories.map((c) =>
      c.id === id ? { ...c, enabled } : c
    );
  }

  function selectCategory(id: string) {
    selectedCategoryId = id;
  }

  const selectedCategory = $derived(
    draftCategories.find((c) => c.id === selectedCategoryId)
  );

  function handleSuggestionPaletteSelect(_palette: Palette) {
    // Categories popover only surfaces individual color picks from suggestions.
    // Palette-level selection (sequential) is not exposed here.
  }

  $effect(() => {
    if (open) untrack(() => initDraft());
  });

  $effect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef && !popoverRef.contains(target)) {
        if (triggerElement && triggerElement.contains(target)) return;
        const path = e.composedPath() as Element[];
        if (path.some((el) => el.id === 'khartis-color-picker-dropdown')) {
          return;
        }
        handleClose();
      }
    }

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
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const active = document.activeElement as HTMLElement | null;
        const items = Array.from(
          popoverRef?.querySelectorAll<HTMLElement>('.category-main') ?? []
        );
        const idx = items.indexOf(active ?? ({} as HTMLElement));
        if (idx === -1) return;
        e.preventDefault();
        const next =
          e.key === 'ArrowDown'
            ? items[(idx + 1) % items.length]
            : items[(idx - 1 + items.length) % items.length];
        next?.focus();
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener(EVENT.CLICK, handleClick);
    }, 0);
    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener(EVENT.CLICK, handleClick);
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
        <PaletteSuggestions
          paletteType={PALETTE_TYPE.QUALITATIVE}
          bind:colorBlindFilter={draftColorBlindFilter}
          selectedPaletteId="__custom__"
          selectedColor={selectedCategory?.color}
          numClasses={draftCategories.length}
          onSelect={handleSuggestionPaletteSelect}
          onColorSelect={handleSuggestionColor}
        />

        {#if showCommonAspect}
          <section class="aspect-common">
            <div class="section-heading">
              <span class="section-heading-text">
                {m.aspect_common_section()}
              </span>
              <div class="section-heading-line"></div>
            </div>
            <div class="common-row">
              {#if primitiveKind === 'symbols'}
                <label class="common-toggle">
                  <span>{m.aspect_common_size_unique()}</span>
                  <Switch
                    toggled={draftCommonAspect.sizeUnique}
                    labelText={m.aspect_common_size_unique()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('sizeUnique', v)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_stroke_yesno()}</span>
                  <Switch
                    toggled={draftCommonAspect.stroke}
                    labelText={m.aspect_common_stroke_yesno()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('stroke', v)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_auto_color()}</span>
                  <Switch
                    toggled={draftCommonAspect.autoColor}
                    labelText={m.aspect_common_auto_color()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('autoColor', v)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_stroke_size()}</span>
                  <Switch
                    toggled={(draftCommonAspect.strokeSize ?? 1) > 0}
                    labelText={m.aspect_common_stroke_size()}
                    hideLabel
                    onchange={(v) =>
                      handleCommonAspectChange('strokeSize', v ? 1 : 0)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_pattern()}</span>
                  <Switch
                    toggled={draftCommonAspect.pattern}
                    labelText={m.aspect_common_pattern()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('pattern', v)}
                  />
                </label>
              {:else if primitiveKind === 'polygons'}
                <label class="common-toggle">
                  <span>{m.aspect_common_stroke_yesno()}</span>
                  <Switch
                    toggled={draftCommonAspect.stroke}
                    labelText={m.aspect_common_stroke_yesno()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('stroke', v)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_stroke_size()}</span>
                  <Switch
                    toggled={(draftCommonAspect.strokeSize ?? 1) > 0}
                    labelText={m.aspect_common_stroke_size()}
                    hideLabel
                    onchange={(v) =>
                      handleCommonAspectChange('strokeSize', v ? 1 : 0)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_auto_color()}</span>
                  <Switch
                    toggled={draftCommonAspect.autoColor}
                    labelText={m.aspect_common_auto_color()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('autoColor', v)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_pattern()}</span>
                  <Switch
                    toggled={draftCommonAspect.pattern}
                    labelText={m.aspect_common_pattern()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('pattern', v)}
                  />
                </label>
              {:else if primitiveKind === 'lines'}
                <label class="common-toggle">
                  <span>{m.aspect_common_thickness()}</span>
                  <Switch
                    toggled={(draftCommonAspect.thickness ?? 1) > 0}
                    labelText={m.aspect_common_thickness()}
                    hideLabel
                    onchange={(v) =>
                      handleCommonAspectChange('thickness', v ? 1 : 0)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_dashed()}</span>
                  <Switch
                    toggled={draftCommonAspect.dashed ?? false}
                    labelText={m.aspect_common_dashed()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('dashed', v)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_auto_color()}</span>
                  <Switch
                    toggled={draftCommonAspect.autoColor}
                    labelText={m.aspect_common_auto_color()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('autoColor', v)}
                  />
                </label>
              {:else if primitiveKind === 'texts'}
                <label class="common-toggle">
                  <span>{m.aspect_common_label_size()}</span>
                  <Switch
                    toggled={(draftCommonAspect.labelSize ?? 12) > 0}
                    labelText={m.aspect_common_label_size()}
                    hideLabel
                    onchange={(v) =>
                      handleCommonAspectChange('labelSize', v ? 12 : 0)}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_font_style()}</span>
                  <Switch
                    toggled={(draftCommonAspect.fontStyle ?? 'regular') !==
                      'regular'}
                    labelText={m.aspect_common_font_style()}
                    hideLabel
                    onchange={(v) =>
                      handleCommonAspectChange(
                        'fontStyle',
                        v ? 'bold' : 'regular'
                      )}
                  />
                </label>
                <label class="common-toggle">
                  <span>{m.aspect_common_auto_color()}</span>
                  <Switch
                    toggled={draftCommonAspect.autoColor}
                    labelText={m.aspect_common_auto_color()}
                    hideLabel
                    onchange={(v) => handleCommonAspectChange('autoColor', v)}
                  />
                </label>
              {/if}
            </div>
          </section>
        {/if}

        <section class="aspect-custom">
          <div class="section-heading">
            <span class="section-heading-text">
              {m.palette_categories_custom_section()}
            </span>
            <div class="section-heading-line"></div>
          </div>

          <div class="sort-row">
            <span class="sort-label">{m.palette_categories_sort()}</span>
            <div class="sort-dropdown">
              <span>{m.palette_categories_sort_manual()}</span>
              <ChevronDown size={16} />
            </div>
          </div>

          <p class="list-label">{m.palette_categories_list_label()}</p>
          <ul class="category-list">
            {#each draftCategories as cat (cat.id)}
              <li
                class="category-item"
                class:selected={selectedCategoryId === cat.id}
              >
                <div class="category-header">
                  <button
                    type="button"
                    class="category-main"
                    onclick={() => {
                      selectCategory(cat.id);
                      toggleCategoryExpand(cat.id);
                    }}
                    aria-expanded={expandedCategoryId === cat.id}
                  >
                    <SingleColorPreview
                      color={cat.color}
                      onchange={(hex) => handleCategoryColor(cat.id, hex)}
                    />
                    <input
                      type="text"
                      class="category-label-input"
                      value={cat.label}
                      oninput={(e: Event) =>
                        handleCategoryLabel(
                          cat.id,
                          (e.currentTarget as HTMLInputElement).value
                        )}
                    />
                    <ChevronDown
                      size={16}
                      style={expandedCategoryId === cat.id
                        ? 'transform: rotate(180deg)'
                        : ''}
                    />
                  </button>
                  <div class="category-toggle">
                    <Switch
                      toggled={cat.enabled}
                      labelText={cat.label}
                      hideLabel
                      onchange={(v) => handleCategoryToggle(cat.id, v)}
                    />
                  </div>
                </div>

                {#if expandedCategoryId === cat.id}
                  <div class="category-aspect-expand">
                    <span class="aspect-expand-title"
                      >{m.per_category_aspect()}</span
                    >
                    <div class="aspect-row">
                      <span class="aspect-row-label"
                        >{m.per_category_color()}</span
                      >
                      <SingleColorPreview
                        color={cat.color}
                        onchange={(hex) => handleCategoryColor(cat.id, hex)}
                      />
                    </div>
                    {#if showCategoryShapePicker}
                      <div class="aspect-row">
                        <span class="aspect-row-label"
                          >{m.per_category_shape()}</span
                        >
                        <select
                          class="aspect-shape-select"
                          value={cat.shape ?? 'circle'}
                          onchange={(e: Event) =>
                            handleCategoryShape(
                              cat.id,
                              (e.currentTarget as HTMLSelectElement).value
                            )}
                        >
                          {#each shapeChoices as sc (sc.id)}
                            <option value={sc.id}>{sc.label}</option>
                          {/each}
                        </select>
                      </div>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      </div>

      <div class="popover-footer-wrap">
        <div class="popover-divider"></div>
        <footer class="popover-footer">
          <Button kind="tertiary" size="small" on:click={handleCancel}>
            {m.button_cancel()}
          </Button>
          <Button
            kind="primary"
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
    border: 1px solid var(--cds-border-subtle);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.15);
    z-index: var(--z-popover);
    overflow: hidden;
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
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .aspect-custom {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .aspect-common {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .common-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
  }

  .common-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--cds-text-secondary, #525252);
  }

  .category-aspect-expand {
    margin-top: 8px;
    padding: 8px;
    border-top: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .aspect-expand-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--cds-text-secondary, #525252);
  }

  .aspect-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .aspect-row-label {
    font-size: 12px;
    color: var(--cds-text-secondary);
    min-width: 60px;
  }

  .aspect-shape-select {
    flex: 1;
    padding: 4px 8px;
    font-size: 14px;
    background: var(--cds-field-01, #f4f4f4);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
  }

  .section-heading-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 14px;
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

  .sort-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sort-label {
    font-size: 12px;
    color: var(--cds-text-secondary, #525252);
  }

  .sort-dropdown {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 16px;
    height: 32px;
    background: var(--cds-field-01, #f4f4f4);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    font-size: 14px;
  }

  .list-label {
    margin: 0;
    font-size: 12px;
    color: var(--cds-text-secondary, #525252);
    letter-spacing: 0.32px;
  }

  .category-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-item {
    padding: 8px;
    background: var(--cds-layer-01, #f4f4f4);
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);

    &.selected {
      border-color: var(--cds-interactive);
    }
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .category-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .category-label-input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid transparent;
    background: transparent;
    font-size: 14px;
    color: var(--cds-text-primary);

    &:focus {
      outline: none;
      border-color: var(--cds-border-interactive);
    }
  }

  .category-toggle {
    display: flex;
    align-items: center;
  }

  .popover-footer-wrap {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .popover-divider {
    height: 8px;
    flex-shrink: 0;
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
</style>
