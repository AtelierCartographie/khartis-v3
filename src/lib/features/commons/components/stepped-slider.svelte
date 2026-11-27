<script lang="ts" generics="T extends string | number">
  import { Slider } from 'carbon-components-svelte';

  interface Step {
    value: T;
    label: string;
  }

  interface Props {
    label: string;
    steps: readonly Step[];
    value: T;
    disabled?: boolean;
    onchange?: (value: T) => void;
  }

  const { label, steps, value, disabled = false, onchange }: Props = $props();

  const componentId = $props.id();

  // The slider runs on step indexes, so the marks sit evenly on the track
  // whatever the values they stand for.
  const marks = $derived(
    steps.map((step, index) => ({ value: index, label: step.label }))
  );
  const index = $derived(
    Math.max(
      0,
      steps.findIndex((step) => step.value === value)
    )
  );

  function handleInput(next: number | null) {
    if (next === null) return;
    const step = steps[Math.round(next)];
    if (step && step.value !== value) onchange?.(step.value);
  }
</script>

<div class="stepped-slider">
  <span class="field-label" id="{componentId}-label">{label}</span>
  <Slider
    id="{componentId}-slider"
    min={0}
    max={Math.max(steps.length - 1, 1)}
    step={1}
    value={index}
    marks={marks}
    snapToMarks
    disabled={disabled}
    labelText={label}
    hideLabel
    hideTextInput
    hideRangeLabels
    fullWidth
    on:input={(e) => handleInput(e.detail)}
  />
</div>

<style>
  .stepped-slider {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }

  .field-label {
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
  }
</style>
