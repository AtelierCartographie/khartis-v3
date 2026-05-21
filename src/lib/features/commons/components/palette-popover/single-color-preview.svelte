<script lang="ts">
  import { ChevronDown } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import SingleColorDropdown from './single-color-dropdown.svelte';
  import PalettePopover from './palette-popover.svelte';
  import {
    PALETTE_TYPE,
    type Palette,
    type PatternParams
  } from './palette.constants';

  interface Props {
    label?: string;
    color: string;
    patternId?: string;
    exclusive?: boolean;
    onchange?: (hex: string) => void;
    onpatternchange?: (
      patternId: string | undefined,
      patternParams: PatternParams | undefined
    ) => void;
  }

  let {
    label,
    color,
    patternId,
    exclusive = false,
    onchange,
    onpatternchange
  }: Props = $props();

  let dropdownOpen = $state(false);
  let popoverOpen = $state(false);
  let triggerRef = $state<HTMLDivElement>();

  function handleClick() {
    dropdownOpen = !dropdownOpen;
  }

  function handleDropdownSelect(hex: string) {
    onchange?.(hex);
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
    _nextInverted: boolean,
    patternParams?: PatternParams
  ) {
    const hex = newColors[0];
    if (hex) onchange?.(hex);
    const nextPatternId = palette?.patternId;
    onpatternchange?.(nextPatternId, nextPatternId ? patternParams : undefined);
    popoverOpen = false;
  }

  function handlePopoverClose() {
    popoverOpen = false;
  }
</script>

<div class="single-color-preview-wrapper">
  {#if label}
    <span class="field-label">{label}</span>
  {/if}
  <div class="color-trigger" bind:this={triggerRef}>
    <button
      type="button"
      class="color-main"
      onclick={handleClick}
      aria-label={m.color()}
      aria-expanded={dropdownOpen}
    >
      <div class="color-swatch" style="background-color: {color}"></div>
      <ChevronDown size={16} />
    </button>
  </div>
</div>

<SingleColorDropdown
  bind:open={dropdownOpen}
  triggerElement={triggerRef}
  selectedColor={color}
  exclusive={exclusive}
  onclose={handleDropdownClose}
  onselect={handleDropdownSelect}
  oncustomize={handleCustomize}
/>

<PalettePopover
  bind:open={popoverOpen}
  triggerElement={triggerRef}
  currentColors={[color]}
  currentInverted={false}
  selectedPaletteId={patternId ? `pattern-${patternId}` : '__custom__'}
  paletteType={PALETTE_TYPE.QUALITATIVE}
  colorBlindFilter={false}
  numClasses={1}
  exclusive={exclusive}
  onclose={handlePopoverClose}
  onvalidate={handlePopoverValidate}
/>

<style lang="scss">
  .single-color-preview-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .color-trigger {
    display: flex;
    align-items: center;
  }

  .color-main {
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

  .color-swatch {
    flex: 1;
    min-width: 0;
    height: 18px;
    border: 1px solid var(--khartis-palette-swatch-border-color);
  }

  .color-main :global(svg) {
    flex-shrink: 0;
    color: var(--cds-icon-primary, #161616);
  }
</style>
