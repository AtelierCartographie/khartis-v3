<script lang="ts">
  import * as m from '$lib/paraglide/messages';
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
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .color-selector {
    display: flex;
    align-items: center;
    padding: var(--cds-spacing-03);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
    cursor: pointer;

    &:hover {
      background: var(--cds-field-hover);
    }

    &.small {
      padding: var(--cds-spacing-02);
    }
  }

  .color-preview {
    width: 100%;
    max-width: 180px;
    height: 24px;
    border-radius: 2px;

    &.small {
      max-width: 100%;
      height: 32px;
    }
  }
</style>
