<script lang="ts">
  import { stopBubbleEvents } from '$lib/features/commons/utils/stop-bubble-events';

  interface Props {
    checked?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    variant?: 'default' | 'suggestions';
    labelText?: string;
    hideLabel?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    indeterminate = false,
    disabled = false,
    size = 'sm',
    variant = 'default',
    labelText = '',
    hideLabel = false,
    onchange
  }: Props = $props();

  let checkboxInput = $state<HTMLInputElement>();

  function handleChange(event: Event): void {
    const next = (event.currentTarget as HTMLInputElement).checked;
    checked = next;
    onchange?.(next);
  }

  $effect(() => {
    if (checkboxInput) {
      checkboxInput.indeterminate = indeterminate && !checked;
    }
  });
</script>

<label
  class="kh-checkbox-native"
  class:disabled={disabled}
  class:sm={size === 'sm'}
  class:variant-suggestions={variant === 'suggestions'}
  use:stopBubbleEvents
>
  <input
    bind:this={checkboxInput}
    type="checkbox"
    class="kh-checkbox-input"
    class:indeterminate={indeterminate && !checked}
    checked={checked}
    disabled={disabled}
    aria-checked={indeterminate && !checked ? 'mixed' : checked}
    aria-label={hideLabel ? labelText : undefined}
    onchange={handleChange}
  />

  {#if !hideLabel && labelText}
    <span class="kh-checkbox-label">{labelText}</span>
  {/if}
</label>

<style lang="scss">
  .kh-checkbox-native {
    --_kh-checkbox-size: 18px;
    --_kh-checkbox-mark-size: 10px;
    --_kh-checkbox-border: var(--cds-ui-04, #8d8d8d);
    --_kh-checkbox-border-hover: var(--cds-blue, #0072c3);
    --_kh-checkbox-bg: var(--cds-layer-01, #ffffff);
    --_kh-checkbox-bg-checked: var(--cds-blue, #0072c3);
    --_kh-checkbox-mark-color: var(--cds-icon-on-color, #ffffff);
    --_kh-checkbox-label-size: 0.875rem;
    --_kh-checkbox-label-line-height: 1.125rem;
    --_kh-checkbox-label-letter-spacing: 0.16px;
    --_kh-checkbox-label-color: var(--cds-text-primary, #161616);
    --_kh-checkbox-focus-ring: 0 0 0 2px var(--cds-focus, #0f62fe);
    --_kh-checkbox-disabled-opacity: 0.5;
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    cursor: pointer;
  }

  .kh-checkbox-native.sm {
    --_kh-checkbox-size: 16px;
    --_kh-checkbox-mark-size: 8px;
  }

  .kh-checkbox-native.variant-suggestions {
    --_kh-checkbox-border: var(
      --khartis-additions-border-tile-01-suggestions,
      #82cfff
    );
    --_kh-checkbox-border-hover: var(--cds-blue, #0072c3);
    --_kh-checkbox-bg: var(--khartis-additions-background-suggestions, #edf5ff);
    --_kh-checkbox-bg-checked: var(--cds-blue, #0072c3);
    --_kh-checkbox-label-size: 0.75rem;
    --_kh-checkbox-label-line-height: 1rem;
    --_kh-checkbox-label-letter-spacing: 0.32px;
    --_kh-checkbox-label-color: var(
      --khartis-additions-text-secondary-suggestions,
      #00539a
    );
    --_kh-checkbox-focus-ring: 0 0 0 2px var(--cds-interactive-03, #726e6e);
    --_kh-checkbox-disabled-opacity: 1;
  }

  .kh-checkbox-native.disabled {
    cursor: not-allowed;
  }

  .kh-checkbox-input {
    appearance: none;
    position: relative;
    width: var(--_kh-checkbox-size);
    height: var(--_kh-checkbox-size);
    border: 1px solid var(--_kh-checkbox-border);
    border-radius: 2px;
    background-color: var(--_kh-checkbox-bg);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease,
      box-shadow 0.12s ease;
  }

  .kh-checkbox-input::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 45%;
    width: calc(var(--_kh-checkbox-mark-size) * 0.45);
    height: calc(var(--_kh-checkbox-mark-size) * 0.75);
    border: solid var(--_kh-checkbox-mark-color);
    border-width: 0 2px 2px 0;
    transform: translate(-50%, -55%) rotate(45deg) scale(0);
    transform-origin: center;
    transition: transform 0.12s ease;
  }

  .kh-checkbox-input:hover:not(:disabled) {
    border-color: var(--_kh-checkbox-border-hover);
  }

  .kh-checkbox-input:checked,
  .kh-checkbox-input.indeterminate {
    border-color: var(--_kh-checkbox-bg-checked);
    background-color: var(--_kh-checkbox-bg-checked);
  }

  .kh-checkbox-input:checked::after {
    transform: translate(-50%, -55%) rotate(45deg) scale(1);
  }

  .kh-checkbox-input.indeterminate::after {
    left: 50%;
    top: 50%;
    width: calc(var(--_kh-checkbox-mark-size) * 0.8);
    height: 2px;
    border: 0;
    background-color: var(--_kh-checkbox-mark-color);
    transform: translate(-50%, -50%) scale(1);
  }

  .kh-checkbox-input:disabled {
    opacity: var(--_kh-checkbox-disabled-opacity);
    cursor: not-allowed;
  }

  .kh-checkbox-input:focus-visible {
    outline: none;
    box-shadow: var(--_kh-checkbox-focus-ring);
  }

  .kh-checkbox-label {
    color: var(--_kh-checkbox-label-color);
    font-size: var(--_kh-checkbox-label-size);
    line-height: var(--_kh-checkbox-label-line-height);
    letter-spacing: var(--_kh-checkbox-label-letter-spacing);
  }
</style>
