<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { SliderWithInput, SectionHeading, ToggleWithLabel } from '../shared';
  import DottedToggle from './dotted-toggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapDottedPattern
  } from '$lib/features/commons/constants/visualization.constants';
  import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
  import {
    COLOR_ROLE,
    getColorSuggestions
  } from '$lib/features/commons/services/color-suggestion.service';

  interface Props {
    showFillSection?: boolean;
    showStrokeSection?: boolean;
    fillColor?: string;
    fillShadow?: boolean;
    fillOpacity?: number;
    strokeVisible?: boolean;
    strokeColor?: string;
    strokeDotted?: boolean;
    strokeDottedPattern?: BasemapDottedPattern;
    strokeThickness?: number;
    strokeOpacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  let {
    showFillSection = true,
    showStrokeSection = true,
    fillColor = NEUTRAL_CARTOGRAPHY_COLORS.land,
    fillShadow = false,
    fillOpacity = 100,
    strokeVisible = true,
    strokeColor = NEUTRAL_CARTOGRAPHY_COLORS.boundaryMedium,
    strokeDotted = false,
    strokeDottedPattern = BasemapDottedPattern.DOTS,
    strokeThickness = 0.5,
    strokeOpacity = 100,
    onchange
  }: Props = $props();

  const fillColorPresets = getColorSuggestions(COLOR_ROLE.TERRITORY_FILL);
  const strokeColorPresets = $derived(
    getColorSuggestions(COLOR_ROLE.TERRITORY_STROKE, fillColor)
  );

  function handleFillColorChange(value: string) {
    onchange?.({ fillColor: value });
  }

  function handleFillShadowToggle(value: boolean) {
    onchange?.({ fillShadow: value });
  }

  function handleFillOpacityChange(value: number) {
    onchange?.({ fillOpacity: value });
  }

  function handleStrokeVisibleToggle(value: boolean) {
    onchange?.({ strokeVisible: value });
  }

  function handleStrokeColorChange(value: string) {
    onchange?.({ strokeColor: value });
  }

  function handleStrokeDottedChange(enabled: boolean) {
    onchange?.({ strokeDotted: enabled });
  }

  function handleStrokeDottedPatternChange(pattern: BasemapDottedPattern) {
    onchange?.({ strokeDottedPattern: pattern });
  }

  function handleStrokeThicknessChange(value: number) {
    onchange?.({ strokeThickness: value });
  }

  function handleStrokeOpacityChange(value: number) {
    onchange?.({ strokeOpacity: value });
  }
</script>

<div class="layer-config-content">
  {#if showFillSection}
    <fieldset class="config-section">
      <legend class="config-legend">
        <SectionHeading title={m.basemap_config_fill()} />
      </legend>
      <div class="section-content">
        <SingleColorPreview
          label={m.basemap_config_color()}
          color={fillColor}
          presets={fillColorPresets}
          allowPattern={false}
          onchange={handleFillColorChange}
        />

        <ToggleWithLabel
          label={m.basemap_config_shadow()}
          toggled={fillShadow}
          ontoggle={handleFillShadowToggle}
        />

        <SliderWithInput
          label={m.basemap_config_opacity()}
          min={BASEMAP_LAYER_CONFIG.opacity.min}
          max={BASEMAP_LAYER_CONFIG.opacity.max}
          step={BASEMAP_LAYER_CONFIG.opacity.step}
          value={fillOpacity}
          onchange={handleFillOpacityChange}
        />
      </div>
    </fieldset>
  {/if}

  {#if showStrokeSection}
    <fieldset class="config-section">
      <legend class="config-legend">
        <SectionHeading title={m.basemap_config_stroke()} />
      </legend>
      <div class="section-content">
        <ToggleWithLabel
          label={m.basemap_config_stroke_visible()}
          toggled={strokeVisible}
          ontoggle={handleStrokeVisibleToggle}
        />

        <SingleColorPreview
          label={m.basemap_config_color()}
          color={strokeColor}
          presets={strokeColorPresets}
          allowPattern={false}
          onchange={handleStrokeColorChange}
        />

        <DottedToggle
          enabled={strokeDotted}
          showPattern={true}
          pattern={strokeDottedPattern}
          onenabledchange={handleStrokeDottedChange}
          onpatternchange={handleStrokeDottedPatternChange}
        />

        <SliderWithInput
          label={m.basemap_config_thickness()}
          min={0}
          max={BASEMAP_LAYER_CONFIG.thickness.max}
          step={BASEMAP_LAYER_CONFIG.thickness.step}
          value={strokeThickness}
          onchange={handleStrokeThicknessChange}
        />

        <SliderWithInput
          label={m.basemap_config_opacity()}
          min={BASEMAP_LAYER_CONFIG.opacity.min}
          max={BASEMAP_LAYER_CONFIG.opacity.max}
          step={BASEMAP_LAYER_CONFIG.opacity.step}
          value={strokeOpacity}
          onchange={handleStrokeOpacityChange}
        />
      </div>
    </fieldset>
  {/if}
</div>

<style lang="scss">
  .layer-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
  }

  .config-section {
    border: none;
    padding: 0;
    margin: 0;
  }

  .config-legend {
    display: block;
    width: 100%;
    padding: 0;
    margin: 0 0 var(--cds-spacing-03) 0;
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
  }
</style>
