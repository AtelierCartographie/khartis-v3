<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { Globe } from 'carbon-icons-svelte';
  import ColorDropdown from './ColorDropdown.svelte';
  import { SliderWithInput } from '../shared';
  import DottedToggle from './DottedToggle.svelte';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapRemarquables,
    BasemapDottedPattern
  } from '../../../constants';

  interface RemarquablesOption {
    id: BasemapRemarquables;
    text: string;
  }

  interface Props {
    remarquables?: BasemapRemarquables;
    color?: string;
    dotted?: boolean;
    dottedPattern?: BasemapDottedPattern;
    thickness?: number;
    opacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  function getRemarquablesOptions(): RemarquablesOption[] {
    return [
      {
        id: BasemapRemarquables.ALL,
        text: m.basemap_config_remarquables_all()
      },
      {
        id: BasemapRemarquables.EQUATOR_TROPICS,
        text: m.basemap_config_remarquables_equator_tropics()
      },
      {
        id: BasemapRemarquables.MAJOR,
        text: m.basemap_config_remarquables_major()
      },
      {
        id: BasemapRemarquables.MINOR,
        text: m.basemap_config_remarquables_minor()
      }
    ];
  }

  let {
    remarquables = BasemapRemarquables.ALL,
    color = '#e0e0e0',
    dotted = true,
    dottedPattern = BasemapDottedPattern.DOTS,
    thickness = 1,
    opacity = 50,
    onchange
  }: Props = $props();

  function handleRemarquablesChange(e: CustomEvent<{ selectedId: string }>) {
    onchange?.({ remarquables: e.detail.selectedId as BasemapRemarquables });
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
  <div class="control-group">
    <span class="field-label">
      <Globe size={16} />
      {m.basemap_config_remarquables()}
    </span>
    <Dropdown
      size="sm"
      selectedId={remarquables}
      items={getRemarquablesOptions()}
      on:select={handleRemarquablesChange}
    />
  </div>

  <ColorDropdown value={color} onchange={handleColorChange} />

  <DottedToggle
    enabled={dotted}
    showPattern={true}
    pattern={dottedPattern}
    onenabledchange={handleDottedChange}
    onpatternchange={handleDottedPatternChange}
  />

  <SliderWithInput
    label={m.basemap_config_thickness()}
    min={BASEMAP_LAYER_CONFIG.thickness.min}
    max={BASEMAP_LAYER_CONFIG.thickness.max}
    value={thickness}
    onchange={handleThicknessChange}
  />

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

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }
</style>
