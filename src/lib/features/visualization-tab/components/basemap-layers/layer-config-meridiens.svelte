<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { CenterCircle, Star, Wikis } from 'carbon-icons-svelte';
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
    allowEquator?: boolean;
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
    allowEquator = false,
    disableDotted = false,
    dottedDisabledReason,
    thickness = 1,
    opacity = 100,
    onchange
  }: Props = $props();

  // Remarkable lines come from the basemap's own geographic-lines layer, so the
  // tab only exists when the basemap ships one.
  const modeTabs = $derived([
    ...(allowRemarkable
      ? [
          {
            mode: BasemapGraticuleMode.REMARKABLE,
            icon: Star,
            label: m.basemap_config_graticule_remarkable()
          }
        ]
      : []),
    {
      mode: BasemapGraticuleMode.REGULAR,
      icon: Wikis,
      label: m.basemap_config_graticule_regular()
    },
    // The equator only reads as a graticule on a whole-world extent.
    ...(allowEquator
      ? [
          {
            mode: BasemapGraticuleMode.EQUATOR,
            icon: CenterCircle,
            label: m.basemap_config_graticule_equator()
          }
        ]
      : [])
  ]);

  const effectiveMode = $derived(
    modeTabs.some((tab) => tab.mode === mode)
      ? mode
      : BasemapGraticuleMode.REGULAR
  );

  const activeModeIndex = $derived(
    Math.max(
      0,
      modeTabs.findIndex((tab) => tab.mode === effectiveMode)
    )
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
  <ToggleTabs
    size="lg"
    activeIndex={activeModeIndex}
    items={modeTabs.map((tab) => ({
      icon: tab.icon,
      label: tab.label,
      iconSize: 16
    }))}
    onchange={(index) => handleModeChange(modeTabs[index].mode)}
  />

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
    gap: var(--kh-gap-group);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
  }
</style>
