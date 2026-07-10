<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { Star, Wikis } from 'carbon-icons-svelte';
  import { SliderWithInput } from '../shared';
  import DottedToggle from './dotted-toggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapGraticuleMode,
    BasemapDottedPattern
  } from '$lib/features/commons/constants/visualization.constants';
  import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
  import { createLayerConfigValueHandler } from './layer-config-handlers.utils';

  interface Props {
    mode?: BasemapGraticuleMode;
    spacingDegrees?: number;
    color?: string;
    dotted?: boolean;
    dottedPattern?: BasemapDottedPattern;
    allowRemarkable?: boolean;
    disableDotted?: boolean;
    dottedDisabledReason?: string;
    thickness?: number;
    opacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  let {
    mode = BasemapGraticuleMode.REMARKABLE,
    spacingDegrees = 10,
    color = NEUTRAL_CARTOGRAPHY_COLORS.graticule,
    dotted = true,
    dottedPattern = BasemapDottedPattern.DOTS,
    allowRemarkable = true,
    disableDotted = false,
    dottedDisabledReason,
    thickness = 1,
    opacity = 100,
    onchange
  }: Props = $props();

  const effectiveMode = $derived(
    allowRemarkable ? mode : BasemapGraticuleMode.REGULAR
  );

  function handleModeChange(nextMode: BasemapGraticuleMode) {
    if (nextMode !== mode) {
      onchange?.({ mode: nextMode });
    }
  }

  const getOnChange = () => onchange;
  const handleSpacingChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'spacingDegrees'
  );
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
  {#if allowRemarkable}
    <ToggleTabs
      activeIndex={mode === BasemapGraticuleMode.REGULAR ? 1 : 0}
      items={[
        {
          icon: Star,
          label: m.basemap_config_graticule_remarkable(),
          iconSize: 16
        },
        {
          icon: Wikis,
          label: m.basemap_config_graticule_regular(),
          iconSize: 16
        }
      ]}
      onchange={(index) =>
        handleModeChange(
          index === 1
            ? BasemapGraticuleMode.REGULAR
            : BasemapGraticuleMode.REMARKABLE
        )}
    />
  {/if}

  {#if effectiveMode === BasemapGraticuleMode.REGULAR}
    <div class="control-group">
      <label class="field-label" for="graticule-spacing-input">
        {m.basemap_config_spacing_degrees()}
      </label>
      <CompactNumberInput
        value={spacingDegrees}
        min={BASEMAP_LAYER_CONFIG.graticuleSpacing.min}
        max={BASEMAP_LAYER_CONFIG.graticuleSpacing.max}
        width="100%"
        id="graticule-spacing-input"
        ariaDecrement={m.basemap_config_spacing_degrees_decrement()}
        ariaIncrement={m.basemap_config_spacing_degrees_increment()}
        onchange={handleSpacingChange}
      />
    </div>
  {/if}

  <SingleColorPreview
    label={m.basemap_config_color()}
    color={color}
    allowPattern={false}
    onchange={handleColorChange}
  />

  <DottedToggle
    enabled={dotted}
    disabled={disableDotted}
    disabledReason={dottedDisabledReason}
    showPattern={true}
    pattern={dottedPattern}
    onenabledchange={handleDottedChange}
    onpatternchange={handleDottedPatternChange}
  />

  <SliderWithInput
    label={m.basemap_config_thickness()}
    min={BASEMAP_LAYER_CONFIG.thickness.min}
    max={BASEMAP_LAYER_CONFIG.thickness.max}
    step={BASEMAP_LAYER_CONFIG.thickness.step}
    value={thickness}
    showMinMax
    inputWidth="64px"
    showSteppers={false}
    onchange={handleThicknessChange}
  />

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

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }
</style>
