<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { SectionHeading, SliderWithInput, ToggleWithLabel } from '../shared';
  import { BASEMAP_LAYER_CONFIG } from '$lib/features/commons/constants/visualization.constants';
  import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';

  interface Props {
    color?: string;
    opacity?: number;
    outlineVisible?: boolean;
    showOutline?: boolean;
    outlineColor?: string;
    outlineThickness?: number;
    outlineOpacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
    onoutlinechange?: (updates: Record<string, unknown>) => void;
    onoutlinevisibilitychange?: (visible: boolean) => void;
  }

  let {
    color = NEUTRAL_CARTOGRAPHY_COLORS.sea,
    opacity = 100,
    outlineVisible = true,
    showOutline = true,
    outlineColor = NEUTRAL_CARTOGRAPHY_COLORS.sphereOutline,
    outlineThickness = 0.5,
    outlineOpacity = 100,
    onchange,
    onoutlinechange,
    onoutlinevisibilitychange
  }: Props = $props();
</script>

<div class="layer-config-content">
  <fieldset class="config-section">
    <legend class="config-legend">
      <SectionHeading title={m.basemap_config_fill()} />
    </legend>
    <div class="section-content">
      <SingleColorPreview
        label={m.basemap_config_color()}
        color={color}
        allowPattern={false}
        onchange={(value) => onchange?.({ color: value })}
      />

      <SliderWithInput
        label={m.basemap_config_opacity()}
        min={BASEMAP_LAYER_CONFIG.opacity.min}
        max={BASEMAP_LAYER_CONFIG.opacity.max}
        step={BASEMAP_LAYER_CONFIG.opacity.step}
        value={opacity}
        onchange={(value) => onchange?.({ opacity: value })}
      />
    </div>
  </fieldset>

  {#if showOutline}
    <fieldset class="config-section">
      <legend class="config-legend">
        <SectionHeading title={m.basemap_config_stroke()} />
      </legend>
      <div class="section-content">
        <ToggleWithLabel
          label={m.basemap_config_stroke_visible()}
          toggled={outlineVisible}
          ontoggle={(value) => onoutlinevisibilitychange?.(value)}
        />

        {#if outlineVisible}
          <SingleColorPreview
            label={m.basemap_config_color()}
            color={outlineColor}
            allowPattern={false}
            onchange={(value) => onoutlinechange?.({ color: value })}
          />

          <SliderWithInput
            label={m.basemap_config_thickness()}
            min={BASEMAP_LAYER_CONFIG.thickness.min}
            max={BASEMAP_LAYER_CONFIG.thickness.max}
            step={BASEMAP_LAYER_CONFIG.thickness.step}
            value={outlineThickness}
            showMinMax
            inputWidth="64px"
            showSteppers={false}
            onchange={(value) => onoutlinechange?.({ thickness: value })}
          />

          <SliderWithInput
            label={m.basemap_config_opacity()}
            min={BASEMAP_LAYER_CONFIG.opacity.min}
            max={BASEMAP_LAYER_CONFIG.opacity.max}
            step={BASEMAP_LAYER_CONFIG.opacity.step}
            value={outlineOpacity}
            showMinMax
            inputWidth="64px"
            showSteppers={false}
            onchange={(value) => onoutlinechange?.({ opacity: value })}
          />
        {/if}
      </div>
    </fieldset>
  {/if}
</div>

<style lang="scss">
  .layer-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
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
    gap: var(--cds-spacing-05);
  }
</style>
