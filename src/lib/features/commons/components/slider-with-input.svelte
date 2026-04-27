<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Slider } from 'carbon-components-svelte';
  import CompactNumberInput from './compact-number-input.svelte';

  interface Props {
    label?: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    showMinMax?: boolean;
    minLabel?: string | number;
    maxLabel?: string | number;
    inputWidth?: string;
    disabled?: boolean;
    id?: string;
    showLabel?: boolean;
    showSteppers?: boolean;
    debounceMs?: number;
    onchange?: (value: number) => void;
  }

  let {
    label,
    value = $bindable(),
    min = 0,
    max = 100,
    step = 1,
    showMinMax = false,
    minLabel,
    maxLabel,
    inputWidth = '128px',
    disabled = false,
    id,
    showLabel = true,
    showSteppers = true,
    debounceMs = 120,
    onchange
  }: Props = $props();

  const fallbackInputId = `slider-input-${Math.random().toString(36).slice(2, 10)}`;
  const fallbackSliderId = `slider-${Math.random().toString(36).slice(2, 10)}`;

  const inputId = $derived(id ?? fallbackInputId);
  const sliderId = $derived(`${id ?? fallbackSliderId}-control`);
  const accessibleLabel = $derived(label || 'Slider');

  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: number | null = null;

  function flushPending() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (pendingValue !== null) {
      const next = pendingValue;
      pendingValue = null;
      onchange?.(next);
    }
  }

  function handleSliderChange(newValue: number | null) {
    if (newValue === null) return;
    value = newValue;
    if (debounceMs > 0) {
      pendingValue = newValue;
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(flushPending, debounceMs);
      return;
    }
    onchange?.(newValue);
  }

  function handleInputChange(newValue: number | null) {
    if (newValue === null) return;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    pendingValue = null;
    value = newValue;
    onchange?.(newValue);
  }

  function handleCommit() {
    if (debounceMs > 0) flushPending();
  }

  onDestroy(() => {
    flushPending();
  });
</script>

<div class="slider-with-input-wrapper">
  {#if showLabel && label}
    <label class="field-label" for={inputId}>
      {label}
    </label>
  {/if}

  <div class="slider-with-input">
    {#if showMinMax}
      <span class="slider-bound">{minLabel ?? min}</span>
    {/if}

    <div
      class="slider-container"
      role="presentation"
      onpointerupcapture={handleCommit}
      onkeyupcapture={handleCommit}
      onpointerleave={handleCommit}
    >
      <Slider
        id={sliderId}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        labelText={accessibleLabel}
        hideLabel
        hideTextInput
        fullWidth
        on:input={(e) => handleSliderChange(e.detail)}
      />
    </div>

    {#if showMinMax}
      <span class="slider-bound">{maxLabel ?? max}</span>
    {/if}

    <CompactNumberInput
      id={inputId}
      bind:value={value}
      min={min}
      max={max}
      step={step}
      width={inputWidth}
      height="40px"
      valueMinWidth="3.5rem"
      disabled={disabled}
      showSteppers={showSteppers}
      onchange={handleInputChange}
    />
  </div>
</div>

<style lang="scss">
  .slider-with-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  .slider-with-input {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .slider-bound {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    min-width: 20px;
    font-weight: 400;
  }

  .slider-container {
    flex: 1 1 auto;
    min-width: 0;

    :global(.bx--slider-container) {
      min-width: 100px;
    }

    :global(.bx--slider__track) {
      background: var(--cds-border-subtle);
      height: 2px;
    }

    :global(.bx--slider__filled-track) {
      background: var(--cds-border-strong);
      height: 2px;
    }

    :global(.bx--slider__thumb) {
      width: 16px;
      height: 16px;
      background: var(--cds-icon-primary);
      border: none;
      box-shadow: none;
      border-radius: 50%;
    }

    :global(.bx--slider__thumb:hover) {
      background: var(--cds-icon-primary);
      transform: translate(-50%, -50%) scale(1.1);
    }

    :global(.bx--slider__thumb:focus) {
      outline: 2px solid var(--cds-focus);
      outline-offset: 2px;
    }

    :global(.bx--slider__range-label) {
      display: none;
    }
  }
</style>
