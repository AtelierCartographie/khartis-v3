<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { ArrowsHorizontal, ChevronDown } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import { PalettePopover, PaletteDropdown } from '../palette-popover';
  import type {
    Palette,
    PaletteType,
    PatternParams
  } from '../palette-popover/palette.constants';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    label?: string;
    colors: string[];
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    showInvertButton?: boolean;
    onexpand?: () => void;
    oninvert?: () => void;
    onselect?: (palette: Palette) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  }

  let {
    label,
    colors,
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>('sequential'),
    colorBlindFilter = $bindable(false),
    showInvertButton = true,
    onexpand,
    oninvert,
    onselect,
    onClassificationChange
  }: Props = $props();

  let dropdownOpen = $state(false);
  let popoverOpen = $state(false);
  let triggerRef = $state<HTMLDivElement>();
  let colorInputRefs = $state<HTMLInputElement[]>([]);

  function handleSwatchClick(index: number, event: MouseEvent) {
    event.stopPropagation();
    colorInputRefs[index]?.click();
  }

  function handleSwatchColorChange(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const newColors = [...colors];
    newColors[index] = input.value;
    onClassificationChange?.({ colors: newColors });
  }

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
      patternId: palette.patternId ?? undefined
    });
    dropdownOpen = false;
  }

  function handleCustomize() {
    dropdownOpen = false;
    popoverOpen = true;
  }

  function handleDropdownClose() {
    dropdownOpen = false;
  }

  function handlePopoverValidate(
    palette: Palette | undefined,
    newColors: string[],
    _inverted: boolean,
    patternParams?: PatternParams
  ) {
    if (palette) {
      onselect?.(palette);
    }
    const changes: Parameters<NonNullable<typeof onClassificationChange>>[0] = {
      colors: newColors
    };
    if (palette) {
      changes.paletteId = palette.id;
    }
    if (palette?.patternId) {
      changes.patternId = palette.patternId;
      if (patternParams) {
        changes.patternParams = patternParams;
      }
    }
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
        {#each colors as color, i (i)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="palette-color"
            style="background-color: {color}"
            title={color}
            onclick={(e: MouseEvent) => handleSwatchClick(i, e)}
          ></div>
        {/each}
      </div>
      <ChevronDown size={16} />
    </button>
    {#each colors as color, i (i)}
      <input
        type="color"
        class="color-input-hidden"
        value={color}
        bind:this={colorInputRefs[i]}
        onchange={(e: Event) => handleSwatchColorChange(i, e)}
      />
    {/each}
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
  onclose={handleDropdownClose}
  onselect={handleDropdownSelect}
  oncustomize={handleCustomize}
/>

<PalettePopover
  bind:open={popoverOpen}
  triggerElement={triggerRef}
  currentColors={colors}
  selectedPaletteId={selectedPaletteId}
  bind:paletteType={paletteType}
  bind:colorBlindFilter={colorBlindFilter}
  numClasses={colors.length || 5}
  onclose={handlePopoverClose}
  onvalidate={handlePopoverValidate}
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
    padding: var(--cds-spacing-03);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
  }

  .palette-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;

    &:hover {
      opacity: 0.9;
    }
  }

  .palette-preview {
    display: flex;
    flex: 1;
    height: 24px;
    border-radius: 2px;
    overflow: hidden;
  }

  .palette-color {
    flex: 1;
    height: 100%;
    cursor: pointer;

    &:hover {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: -2px;
      z-index: 1;
    }
  }

  .color-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
</style>
