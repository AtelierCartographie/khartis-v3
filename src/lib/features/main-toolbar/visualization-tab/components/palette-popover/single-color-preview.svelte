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
    onchange?: (hex: string) => void;
  }

  let { label, color, onchange }: Props = $props();

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
    _palette: Palette | undefined,
    newColors: string[],
    _nextInverted: boolean,
    _patternParams?: PatternParams
  ) {
    const hex = newColors[0];
    if (hex) onchange?.(hex);
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
  onclose={handleDropdownClose}
  onselect={handleDropdownSelect}
  oncustomize={handleCustomize}
/>

<PalettePopover
  bind:open={popoverOpen}
  triggerElement={triggerRef}
  currentColors={[color]}
  currentInverted={false}
  selectedPaletteId="__custom__"
  paletteType={PALETTE_TYPE.QUALITATIVE}
  colorBlindFilter={false}
  numClasses={1}
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
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
  }

  .color-main {
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

  .color-swatch {
    flex: 1;
    height: 24px;
    border-radius: 2px;
  }
</style>
