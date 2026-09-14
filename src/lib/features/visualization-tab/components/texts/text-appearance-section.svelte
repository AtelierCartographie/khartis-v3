<script lang="ts">
  import { SLIDER_LIMITS } from '$lib/features/commons/constants/visualization.constants';
  import * as m from '$lib/paraglide/messages';
  import {
    ColorSelector,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel
  } from '../shared';
  import {
    COLOR_ROLE,
    getColorSuggestions
  } from '$lib/features/commons/services/color-suggestion.service';

  interface Props {
    color: string;
    opacity: number;
    halo: boolean;
    haloColor: string;
    haloWidth: number;
    onColorChange: (value: string) => void;
    onOpacityChange: (value: number) => void;
    onHaloToggle: (value: boolean) => void;
    onHaloColorChange: (value: string) => void;
    onHaloWidthChange: (value: number) => void;
  }

  let {
    color,
    opacity,
    halo,
    haloColor,
    haloWidth,
    onColorChange,
    onOpacityChange,
    onHaloToggle,
    onHaloColorChange,
    onHaloWidthChange
  }: Props = $props();
</script>

<div class="text-appearance-section">
  <SectionHeading title={m.text_style_primary_title()} />

  <div class="field-group">
    <ColorSelector
      exclusive
      label={m.color()}
      value={color}
      presets={getColorSuggestions(COLOR_ROLE.TEXT_FILL)}
      onchange={onColorChange}
    />
  </div>

  <SliderWithInput
    label={m.opacity()}
    min={SLIDER_LIMITS.textOpacity.min}
    max={SLIDER_LIMITS.textOpacity.max}
    step={SLIDER_LIMITS.textOpacity.step}
    value={opacity}
    showMinMax
    inputWidth="64px"
    onchange={onOpacityChange}
  />

  <SectionHeading title={m.stroke()} />

  <ToggleWithLabel label={m.stroke()} toggled={halo} ontoggle={onHaloToggle} />

  {#if halo}
    <div class="field-group">
      <ColorSelector
        exclusive
        label={m.color()}
        value={haloColor}
        presets={getColorSuggestions(COLOR_ROLE.TEXT_STROKE)}
        onchange={onHaloColorChange}
      />
    </div>

    <SliderWithInput
      label={m.thickness()}
      min={SLIDER_LIMITS.haloWidth.min}
      max={SLIDER_LIMITS.haloWidth.max}
      step={SLIDER_LIMITS.haloWidth.step}
      value={haloWidth}
      showMinMax
      inputWidth="64px"
      onchange={onHaloWidthChange}
    />
  {/if}
</div>

<style lang="scss">
  .text-appearance-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }
</style>
