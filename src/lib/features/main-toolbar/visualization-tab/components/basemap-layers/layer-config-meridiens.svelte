<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { Star, Wikis } from 'carbon-icons-svelte';
  import { SliderWithInput } from '../shared';
  import DottedToggle from './dotted-toggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapGraticuleMode,
    BasemapDottedPattern
  } from '../../../constants';

  interface Props {
    mode?: BasemapGraticuleMode;
    spacingDegrees?: number;
    color?: string;
    dotted?: boolean;
    dottedPattern?: BasemapDottedPattern;
    disableDotted?: boolean;
    dottedDisabledReason?: string;
    thickness?: number;
    opacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  let {
    mode = BasemapGraticuleMode.REMARKABLE,
    spacingDegrees = 10,
    color = '#e0e0e0',
    dotted = true,
    dottedPattern = BasemapDottedPattern.DOTS,
    disableDotted = false,
    dottedDisabledReason,
    thickness = 1,
    opacity = 50,
    onchange
  }: Props = $props();

  function handleModeChange(nextMode: BasemapGraticuleMode) {
    if (nextMode !== mode) {
      onchange?.({ mode: nextMode });
    }
  }

  function handleSpacingChange(value: number) {
    onchange?.({ spacingDegrees: value });
  }

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
  <div
    class="mode-switcher"
    role="tablist"
    aria-label={m.basemap_config_graticule_mode()}
  >
    <Button
      type="button"
      kind="ghost"
      size="small"
      class={[
        'mode-switcher-button',
        mode === BasemapGraticuleMode.REMARKABLE && 'active'
      ]}
      role="tab"
      aria-selected={mode === BasemapGraticuleMode.REMARKABLE}
      on:click={() => handleModeChange(BasemapGraticuleMode.REMARKABLE)}
    >
      <Star size={16} />
      <span>{m.basemap_config_graticule_remarkable()}</span>
    </Button>
    <Button
      type="button"
      kind="ghost"
      size="small"
      class={[
        'mode-switcher-button',
        mode === BasemapGraticuleMode.REGULAR && 'active'
      ]}
      role="tab"
      aria-selected={mode === BasemapGraticuleMode.REGULAR}
      on:click={() => handleModeChange(BasemapGraticuleMode.REGULAR)}
    >
      <Wikis size={16} />
      <span>{m.basemap_config_graticule_regular()}</span>
    </Button>
  </div>

  {#if mode === BasemapGraticuleMode.REGULAR}
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

  .mode-switcher {
    display: flex;
    align-items: stretch;
    width: 100%;
    border: 1px solid #cac5c4;
    border-radius: 4px;
    overflow: hidden;
  }

  .mode-switcher :global(.mode-switcher-button) {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: 7px 16px;
    border: 0;
    border-right: 1px solid #cac5c4;
    background: transparent;
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.01rem;
    cursor: pointer;
  }

  .mode-switcher :global(.mode-switcher-button:last-child) {
    border-right: 0;
  }

  .mode-switcher :global(.mode-switcher-button:hover:not(.active)) {
    background: var(--cds-layer-hover);
  }

  .mode-switcher :global(.mode-switcher-button.active) {
    background: #cac5c4;
    color: var(--cds-text-primary);
  }

  .mode-switcher :global(.mode-switcher-button span) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }
</style>
