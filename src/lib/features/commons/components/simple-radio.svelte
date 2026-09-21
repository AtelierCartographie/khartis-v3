<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    variant?: 'default' | 'suggestions';
    labelText?: string;
    hideLabel?: boolean;
    name?: string;
    value?: string;
    ariaHidden?: boolean;
    tabIndex?: number;
    decorative?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    size = 'sm',
    variant = 'default',
    labelText = '',
    hideLabel = false,
    name,
    value,
    ariaHidden,
    tabIndex,
    decorative = false,
    onchange
  }: Props = $props();

  function handleChange(event: Event): void {
    const next = (event.currentTarget as HTMLInputElement).checked;
    checked = next;
    onchange?.(next);
  }
</script>

{#if decorative}
  <span
    class="kh-radio-native decorative"
    class:disabled={disabled}
    class:sm={size === 'sm'}
    class:variant-suggestions={variant === 'suggestions'}
    aria-hidden="true"
  >
    <span
      class="kh-radio-input"
      class:checked={checked}
      class:disabled={disabled}
    ></span>
  </span>
{:else}
  <label
    class="kh-radio-native"
    class:disabled={disabled}
    class:sm={size === 'sm'}
    class:variant-suggestions={variant === 'suggestions'}
  >
    <input
      type="radio"
      class="kh-radio-input"
      checked={checked}
      disabled={disabled}
      name={name}
      value={value}
      aria-checked={checked}
      aria-label={hideLabel ? labelText : undefined}
      aria-hidden={ariaHidden}
      tabindex={tabIndex}
      onchange={handleChange}
    />

    {#if !hideLabel && labelText}
      <span class="kh-radio-label">{labelText}</span>
    {/if}
  </label>
{/if}

<style lang="scss">
  .kh-radio-native {
    --_kh-radio-size: 18px;
    --_kh-radio-dot-size: 9px;
    --_kh-radio-border: var(--cds-ui-04, #8d8d8d);
    --_kh-radio-border-hover: var(--cds-blue, #0072c3);
    --_kh-radio-bg: var(--cds-layer-01, #ffffff);
    --_kh-radio-border-checked: var(--cds-blue, #0072c3);
    --_kh-radio-dot-color: var(--cds-blue, #0072c3);
    --_kh-radio-label-size: 0.875rem;
    --_kh-radio-label-line-height: 1.125rem;
    --_kh-radio-label-letter-spacing: 0.16px;
    --_kh-radio-label-color: var(--cds-text-primary, #161616);
    --_kh-radio-focus-ring: 0 0 0 2px var(--cds-focus, #0f62fe);
    --_kh-radio-disabled-opacity: 0.5;
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    min-height: var(--kh-size-control-sm);
    cursor: pointer;
  }

  .kh-radio-native.sm {
    --_kh-radio-size: 16px;
    --_kh-radio-dot-size: 8px;
  }

  .kh-radio-native.variant-suggestions {
    --_kh-radio-border: var(
      --khartis-additions-text-primary-suggestions,
      #003a6d
    );
    --_kh-radio-border-hover: var(--cds-blue, #0072c3);
    --_kh-radio-bg: var(--khartis-additions-background-suggestions, #edf5ff);
    --_kh-radio-border-checked: var(--cds-blue, #0072c3);
    --_kh-radio-dot-color: var(--cds-blue, #0072c3);
    --_kh-radio-label-size: 0.75rem;
    --_kh-radio-label-line-height: 1rem;
    --_kh-radio-label-letter-spacing: 0.32px;
    --_kh-radio-label-color: var(
      --khartis-additions-text-secondary-suggestions,
      #00539a
    );
    --_kh-radio-focus-ring: 0 0 0 2px var(--cds-interactive-03, #726e6e);
    --_kh-radio-disabled-opacity: 0.25;
  }

  .kh-radio-native.disabled {
    cursor: not-allowed;
  }

  .kh-radio-native.decorative {
    pointer-events: none;
  }

  .kh-radio-input {
    appearance: none;
    position: relative;
    width: var(--_kh-radio-size);
    height: var(--_kh-radio-size);
    border: 1px solid var(--_kh-radio-border);
    border-radius: 50%;
    background-color: var(--_kh-radio-bg);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      border-color 0.12s ease,
      box-shadow 0.12s ease;
  }

  .kh-radio-input::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--_kh-radio-dot-size);
    height: var(--_kh-radio-dot-size);
    border-radius: 50%;
    background-color: var(--_kh-radio-dot-color);
    transform: translate(-50%, -50%) scale(0);
    transform-origin: center;
    transition: transform 0.12s ease;
  }

  .kh-radio-input:hover:not(:disabled):not(.disabled) {
    border-color: var(--_kh-radio-border-hover);
  }

  .kh-radio-input.checked,
  .kh-radio-input:checked {
    border-color: var(--_kh-radio-border-checked);
  }

  .kh-radio-input.checked::after,
  .kh-radio-input:checked::after {
    transform: translate(-50%, -50%) scale(1);
  }

  .kh-radio-input.disabled,
  .kh-radio-input:disabled {
    opacity: var(--_kh-radio-disabled-opacity);
    cursor: not-allowed;
  }

  .kh-radio-input:focus-visible {
    outline: none;
    box-shadow: var(--_kh-radio-focus-ring);
  }

  .kh-radio-label {
    color: var(--_kh-radio-label-color);
    font-size: var(--_kh-radio-label-size);
    line-height: var(--_kh-radio-label-line-height);
    letter-spacing: var(--_kh-radio-label-letter-spacing);
  }
</style>
