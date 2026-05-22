<script lang="ts">
  import { Subtract, Add } from 'carbon-icons-svelte';
  import { m } from '$lib/paraglide/messages.js';

  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    width?: string;
    height?: string;
    valueMinWidth?: string;
    disabled?: boolean;
    id?: string;
    showSteppers?: boolean;
    ariaLabel?: string;
    ariaDecrement?: string;
    ariaIncrement?: string;
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(),
    min = 0,
    max = 100,
    step = 1,
    width = '100%',
    height = '32px',
    valueMinWidth = '3rem',
    disabled = false,
    id,
    showSteppers = true,
    ariaLabel,
    ariaDecrement = m.compact_number_decrement(),
    ariaIncrement = m.compact_number_increment(),
    onchange
  }: Props = $props();

  let inputEl = $state<HTMLInputElement | null>(null);

  const atMin = $derived(value <= min);
  const atMax = $derived(value >= max);

  function clamp(next: number): number {
    if (next < min) return min;
    if (next > max) return max;
    return next;
  }

  function commit(next: number) {
    const clamped = clamp(next);
    if (clamped === value) {
      if (inputEl) inputEl.value = String(clamped);
      return;
    }
    value = clamped;
    onchange?.(clamped);
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const parsed = parseFloat(target.value);
    if (!Number.isFinite(parsed)) return;
    commit(parsed);
  }

  function handleBlur() {
    if (inputEl) inputEl.value = String(value);
  }

  function decrement() {
    if (disabled || atMin) return;
    commit(value - step);
  }

  function increment() {
    if (disabled || atMax) return;
    commit(value + step);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      increment();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      decrement();
    }
  }
</script>

<div
  class="compact-number-input"
  class:disabled={disabled}
  class:has-steppers={showSteppers}
  style:--compact-number-input-width={width}
  style:--compact-number-input-height={height}
  style:--compact-number-input-value-min-width={valueMinWidth}
>
  <input
    bind:this={inputEl}
    type="number"
    inputmode="numeric"
    id={id}
    min={min}
    max={max}
    step={step}
    aria-label={ariaLabel ?? undefined}
    value={value}
    disabled={disabled}
    oninput={handleInput}
    onblur={handleBlur}
    onkeydown={handleKeydown}
  />
  {#if showSteppers}
    <div class="steppers">
      <button
        type="button"
        class="stepper"
        aria-label={ariaDecrement}
        disabled={disabled || atMin}
        onclick={decrement}
      >
        <Subtract size={16} />
      </button>
      <span class="stepper-divider" aria-hidden="true"></span>
      <button
        type="button"
        class="stepper"
        aria-label={ariaIncrement}
        disabled={disabled || atMax}
        onclick={increment}
      >
        <Add size={16} />
      </button>
    </div>
  {/if}
</div>

<style lang="scss">
  .compact-number-input {
    --compact-number-input-stepper-width: 40px;

    width: var(--compact-number-input-width, 100%);
    min-width: 64px;
    height: var(--compact-number-input-height, 40px);
    display: flex;
    align-items: stretch;
    background-color: var(--cds-field-01, #f4f4f4);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    transition: border-bottom-color 0.1s ease;

    &.has-steppers {
      min-width: calc(
        var(--compact-number-input-value-min-width, 3rem) +
          (2 * var(--compact-number-input-stepper-width)) + 1px
      );
    }

    &:focus-within:not(.disabled) {
      border-bottom-color: var(--cds-focus, #0f62fe);
      box-shadow: inset 0 -1px 0 0 var(--cds-focus, #0f62fe);
    }

    &.disabled {
      border-bottom-color: transparent;

      input {
        color: var(--cds-text-disabled, #c6c6c6);
        cursor: not-allowed;
      }
    }
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0 var(--cds-spacing-04, 12px);
    border: none;
    background: transparent;
    color: var(--cds-text-primary, #161616);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    outline: none;
    box-sizing: border-box;
    text-align: left;

    appearance: textfield;
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }

  .steppers {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
  }

  .stepper {
    width: var(--compact-number-input-stepper-width);
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-icon-primary, #161616);
    cursor: pointer;
    transition: background-color 0.1s ease;

    &:hover:not(:disabled) {
      background-color: var(--cds-layer-hover-01, #e8e8e8);
    }

    &:active:not(:disabled) {
      background-color: var(--cds-layer-active-01, #c6c6c6);
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: -2px;
    }

    &:disabled {
      color: var(--cds-icon-disabled, #c6c6c6);
      cursor: not-allowed;
    }
  }

  .stepper-divider {
    width: 1px;
    background-color: var(--cds-border-subtle-01, #c6c6c6);
    flex-shrink: 0;
  }
</style>
