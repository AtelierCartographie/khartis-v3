<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { SliderWithInput } from '../../shared';
  import { SLIDER_LIMITS } from '../../../../constants';

  interface Props {
    fillColor: string;
    fillColorB: string;
    fillOpacity: number;
    onColorAChange: (value: string) => void;
    onColorBChange: (value: string) => void;
    onOpacityChange: (value: number) => void;
  }

  let {
    fillColor,
    fillColorB,
    fillOpacity = $bindable(),
    onColorAChange,
    onColorBChange,
    onOpacityChange
  }: Props = $props();
</script>

<div class="double-color-row">
  <div class="double-color-item double-color-a">
    <SingleColorPreview
      exclusive
      label={m.symbol_color_a()}
      color={fillColor}
      onchange={onColorAChange}
    />
  </div>
  <div class="double-color-item double-color-b">
    <SingleColorPreview
      exclusive
      label={m.symbol_color_b()}
      color={fillColorB}
      onchange={onColorBChange}
    />
  </div>
</div>

<SliderWithInput
  label={m.opacity()}
  bind:value={fillOpacity}
  min={SLIDER_LIMITS.opacity.min}
  max={SLIDER_LIMITS.opacity.max}
  step={SLIDER_LIMITS.opacity.step}
  onchange={onOpacityChange}
/>

<style lang="scss">
  .double-color-row {
    display: flex;
    gap: var(--cds-spacing-03);
  }

  .double-color-item {
    flex: 1;
    min-width: 0;
  }

  .double-color-a :global(.color-selector-label) {
    color: var(--cds-interactive);
  }

  .double-color-b :global(.color-selector-label) {
    color: #ff832b;
  }
</style>
