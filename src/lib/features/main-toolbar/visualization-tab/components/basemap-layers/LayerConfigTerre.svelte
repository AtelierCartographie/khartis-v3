<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import ColorDropdown from './ColorDropdown.svelte';
  import { SliderWithInput, SectionHeading } from '../shared';
  import DottedToggle from './DottedToggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapDottedPattern
  } from '../../../constants';

  interface Props {
    fillColor?: string;
    fillShadow?: boolean;
    fillOpacity?: number;
    strokeColor?: string;
    strokeDotted?: boolean;
    strokeDottedPattern?: BasemapDottedPattern;
    strokeThickness?: number;
    strokeOpacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  let {
    fillColor = '#f5e6d3',
    fillShadow = false,
    fillOpacity = 100,
    strokeColor = '#8d8d8d',
    strokeDotted = false,
    strokeDottedPattern = BasemapDottedPattern.DOTS,
    strokeThickness = 1,
    strokeOpacity = 100,
    onchange
  }: Props = $props();

  function handleFillColorChange(value: string) {
    onchange?.({ fillColor: value });
  }

  function handleFillShadowToggle() {
    onchange?.({ fillShadow: !fillShadow });
  }

  function handleFillOpacityChange(value: number) {
    onchange?.({ fillOpacity: value });
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
  <fieldset class="config-section">
    <legend class="config-legend">
      <SectionHeading title={m.basemap_config_fill()} />
    </legend>
    <div class="section-content">
      <ColorDropdown value={fillColor} onchange={handleFillColorChange} />

      <div class="toggle-row">
        <Toggle
          labelText={m.basemap_config_shadow()}
          labelA={m.option_non()}
          labelB={m.option_oui()}
          toggled={fillShadow}
          on:toggle={handleFillShadowToggle}
          size="sm"
        />
      </div>

      <SliderWithInput
        label={m.basemap_config_opacity()}
        min={BASEMAP_LAYER_CONFIG.opacity.min}
        max={BASEMAP_LAYER_CONFIG.opacity.max}
        value={fillOpacity}
        onchange={handleFillOpacityChange}
      />
    </div>
  </fieldset>

  <fieldset class="config-section">
    <legend class="config-legend">
      <SectionHeading title={m.basemap_config_stroke()} />
    </legend>
    <div class="section-content">
      <ColorDropdown value={strokeColor} onchange={handleStrokeColorChange} />

      <DottedToggle
        enabled={strokeDotted}
        showPattern={true}
        pattern={strokeDottedPattern}
        onenabledchange={handleStrokeDottedChange}
        onpatternchange={handleStrokeDottedPatternChange}
      />

      <SliderWithInput
        label={m.basemap_config_thickness()}
        min={BASEMAP_LAYER_CONFIG.thickness.min}
        max={BASEMAP_LAYER_CONFIG.thickness.max}
        value={strokeThickness}
        onchange={handleStrokeThicknessChange}
      />

      <SliderWithInput
        label={m.basemap_config_opacity()}
        min={BASEMAP_LAYER_CONFIG.opacity.min}
        max={BASEMAP_LAYER_CONFIG.opacity.max}
        value={strokeOpacity}
        onchange={handleStrokeOpacityChange}
      />
    </div>
  </fieldset>
</div>

<style lang="scss">
  .layer-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
    padding: var(--cds-spacing-04);
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

  .toggle-row :global(.bx--toggle) {
    margin: 0;
  }

  .toggle-row :global(.bx--toggle-input__label) {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }
</style>
