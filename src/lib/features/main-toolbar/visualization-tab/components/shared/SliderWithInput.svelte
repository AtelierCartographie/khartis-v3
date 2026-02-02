<script lang="ts">
  import { Slider } from 'carbon-components-svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';

  interface Props {
    label?: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    showMinMax?: boolean;
    inputWidth?: string;
    onchange?: (value: number) => void;
  }

  let {
    label,
    value = $bindable(),
    min = 0,
    max = 100,
    step = 1,
    showMinMax = true,
    inputWidth = '64px',
    onchange
  }: Props = $props();

  function handleChange(newValue: number | null) {
    if (newValue === null) return;
    value = newValue;
    onchange?.(newValue);
  }
</script>

<div class="slider-with-input-wrapper">
  {#if label}
    <span class="field-label">{label}</span>
  {/if}
  <div class="slider-with-input">
    {#if showMinMax}
      <span class="slider-bound">{min}</span>
    {/if}
    <div class="slider-container">
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        hideTextInput
        on:change={(e) => handleChange(e.detail)}
      />
    </div>
    {#if showMinMax}
      <span class="slider-bound">{max}</span>
    {/if}
    <CompactNumberInput
      bind:value={value}
      min={min}
      max={max}
      step={step}
      width={inputWidth}
      onchange={handleChange}
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
    font-size: 0.875rem;
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
    flex: 1;

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
  }
</style>
