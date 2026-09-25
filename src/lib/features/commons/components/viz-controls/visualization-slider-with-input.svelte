<script lang="ts">
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import InfoPopover from './info-popover.svelte';

  interface Props {
    label?: string;
    infoText?: string;
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
    showSteppers?: boolean;
    debounceMs?: number;
    onchange?: (value: number) => void;
  }

  let {
    label,
    infoText,
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
    showSteppers = true,
    debounceMs,
    onchange
  }: Props = $props();
</script>

<div class="slider-with-input-wrapper">
  {#if label}
    <span class="field-label">
      {label}
      {#if infoText}
        <InfoPopover text={infoText} />
      {/if}
    </span>
  {/if}

  <SliderWithInput
    label={label}
    bind:value={value}
    min={min}
    max={max}
    step={step}
    showMinMax={showMinMax}
    minLabel={minLabel}
    maxLabel={maxLabel}
    inputWidth={inputWidth}
    disabled={disabled}
    id={id}
    showSteppers={showSteppers}
    showLabel={false}
    debounceMs={debounceMs}
    onchange={onchange}
  />
</div>

<style lang="scss">
  .slider-with-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }
</style>
