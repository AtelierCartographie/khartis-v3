<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import ColorDropdown from './color-dropdown.svelte';
  import { SliderWithInput } from '../shared';
  import DottedToggle from './dotted-toggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapDottedPattern
  } from '../../../constants';

  interface Props {
    showColor?: boolean;
    showDotted?: boolean;
    showThickness?: boolean;
    disableDotted?: boolean;
    dottedDisabledReason?: string;
    thicknessLabel?: string;
    thicknessMax?: number;
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
    color = '#0072c3',
    dotted = false,
    dottedPattern = BasemapDottedPattern.DOTS,
    thickness = 1,
    opacity = 100,
    onchange
  }: Props = $props();

  function handleColorChange(value: string) {
    onchange?.({ color: value });
  }

  function handleDottedChange(enabled: boolean) {
    onchange?.({ dotted: enabled });
  }

  function handleDottedPatternChange(pattern: BasemapDottedPattern) {
    onchange?.({ dottedPattern: pattern });
  }

  function handleThicknessChange(value: number) {
    onchange?.({ thickness: value });
  }

  function handleOpacityChange(value: number) {
    onchange?.({ opacity: value });
  }
</script>

<div class="layer-config-content">
  {#if showColor}
    <ColorDropdown value={color} onchange={handleColorChange} />
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
      value={thickness}
      onchange={handleThicknessChange}
    />
  {/if}

  <SliderWithInput
    label={m.basemap_config_opacity()}
    min={BASEMAP_LAYER_CONFIG.opacity.min}
    max={BASEMAP_LAYER_CONFIG.opacity.max}
    value={opacity}
    onchange={handleOpacityChange}
  />
</div>

<style lang="scss">
  .layer-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-04);
  }
</style>
