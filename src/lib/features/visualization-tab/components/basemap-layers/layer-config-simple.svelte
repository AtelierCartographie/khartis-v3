<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { SliderWithInput } from '../shared';
  import DottedToggle from './dotted-toggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapDottedPattern
  } from '$lib/features/commons/constants/visualization.constants';
  import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
  import { createLayerConfigValueHandler } from './layer-config-handlers.utils';

  interface Props {
    showColor?: boolean;
    showDotted?: boolean;
    showThickness?: boolean;
    disableDotted?: boolean;
    dottedDisabledReason?: string;
    thicknessLabel?: string;
    thicknessMax?: number;
    thicknessStep?: number;
    color?: string;
    dotted?: boolean;
    dottedPattern?: BasemapDottedPattern;
    thickness?: number;
    opacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  let {
    showColor = true,
    showDotted = false,
    showThickness = false,
    disableDotted = false,
    dottedDisabledReason,
    thicknessLabel = m.basemap_config_thickness(),
    thicknessMax = BASEMAP_LAYER_CONFIG.thickness.max,
    thicknessStep = BASEMAP_LAYER_CONFIG.thickness.step,
    color = NEUTRAL_CARTOGRAPHY_COLORS.waterLine,
    dotted = false,
    dottedPattern = BasemapDottedPattern.DOTS,
    thickness = 1,
    opacity = 100,
    onchange
  }: Props = $props();

  const getOnChange = () => onchange;
  const handleColorChange = createLayerConfigValueHandler<string>(
    getOnChange,
    'color'
  );
  const handleDottedChange = createLayerConfigValueHandler<boolean>(
    getOnChange,
    'dotted'
  );
  const handleDottedPatternChange =
    createLayerConfigValueHandler<BasemapDottedPattern>(
      getOnChange,
      'dottedPattern'
    );
  const handleThicknessChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'thickness'
  );
  const handleOpacityChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'opacity'
  );
</script>

<div class="layer-config-content">
  {#if showColor}
    <SingleColorPreview
      label={m.basemap_config_color()}
      color={color}
      onchange={handleColorChange}
    />
  {/if}

  {#if showDotted}
    <DottedToggle
      enabled={dotted}
      disabled={disableDotted}
      disabledReason={dottedDisabledReason}
      showPattern={true}
      pattern={dottedPattern}
      onenabledchange={handleDottedChange}
      onpatternchange={handleDottedPatternChange}
    />
  {/if}

  {#if showThickness}
    <SliderWithInput
      label={thicknessLabel}
      min={BASEMAP_LAYER_CONFIG.thickness.min}
      max={thicknessMax}
      step={thicknessStep}
      value={thickness}
      showMinMax
      inputWidth="64px"
      showSteppers={false}
      onchange={handleThicknessChange}
    />
  {/if}

  <SliderWithInput
    label={m.basemap_config_opacity()}
    min={BASEMAP_LAYER_CONFIG.opacity.min}
    max={BASEMAP_LAYER_CONFIG.opacity.max}
    step={BASEMAP_LAYER_CONFIG.opacity.step}
    value={opacity}
    showMinMax
    inputWidth="64px"
    showSteppers={false}
    onchange={handleOpacityChange}
  />
</div>

<style lang="scss">
  .layer-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }
</style>
