<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { ChevronDown } from 'carbon-icons-svelte';
  import ColorPickerModal from '../color-picker-modal.svelte';

  interface Props {
    label?: string;
    value: string;
    size?: 'default' | 'small';
    onchange?: (color: string) => void;
  }

  let { label, value, size = 'default', onchange }: Props = $props();

  let colorPickerOpen = $state(false);

  function handleClick() {
    colorPickerOpen = true;
  }

  function handleColorSelect(color: string) {
    onchange?.(color);
    colorPickerOpen = false;
  }

  function handleClose() {
    colorPickerOpen = false;
  }
</script>

<div class="color-selector-wrapper">
  {#if label}
    <span class="field-label">{label}</span>
  {/if}
  <button
    type="button"
    class="color-selector"
    class:small={size === 'small'}
    onclick={handleClick}
    aria-label={m.color()}
  >
    <div
      class="color-preview"
      class:small={size === 'small'}
      style="background-color: {value}"
    ></div>
    <span class="color-chevron">
      <ChevronDown size={16} />
    </span>
  </button>
</div>

<ColorPickerModal
  bind:open={colorPickerOpen}
  color={value}
  onclose={handleClose}
  onselect={handleColorSelect}
/>

<style lang="scss">
  .color-selector-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
    margin-bottom: var(--cds-spacing-02);
  }

  .color-selector {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    background: var(--cds-field);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong);
    cursor: pointer;
    width: 100%;
    gap: var(--cds-spacing-03);

    &:hover {
      background: var(--cds-field-hover);
    }

    &:focus {
      outline: 2px solid var(--cds-focus);
      outline-offset: -2px;
    }

    &.small {
      padding: var(--cds-spacing-02) var(--cds-spacing-03);
    }
  }

  .color-preview {
    flex: 1;
    height: 20px;
    background-color: var(--cds-background);

    &.small {
      height: 16px;
    }
  }

  .color-chevron {
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary);
    flex-shrink: 0;
  }
</style>
