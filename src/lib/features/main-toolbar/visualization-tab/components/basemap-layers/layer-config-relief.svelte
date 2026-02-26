<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { Mountain } from 'carbon-icons-svelte';
  import ColorDropdown from './color-dropdown.svelte';
  import { SliderWithInput } from '../shared';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapRepresentation
  } from '../../../constants';

  interface RepresentationOption {
    id: BasemapRepresentation;
    text: string;
  }

  interface Props {
    representation?: BasemapRepresentation;
    color?: string;
    opacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  function getRepresentationOptions(): RepresentationOption[] {
    return [
      {
        id: BasemapRepresentation.SHADING,
        text: m.basemap_config_representation_shading()
      },
      {
        id: BasemapRepresentation.ELEVATION,
        text: m.basemap_config_representation_elevation()
      },
      {
        id: BasemapRepresentation.CONTOURS,
        text: m.basemap_config_representation_contours()
      }
    ];
  }

  let {
    representation = BasemapRepresentation.SHADING,
    color = '#8d8d8d',
    opacity = 50,
    onchange
  }: Props = $props();

  function handleRepresentationChange(e: CustomEvent<{ selectedId: string }>) {
    onchange?.({
      representation: e.detail.selectedId as BasemapRepresentation
    });
  }

  function handleColorChange(value: string) {
    onchange?.({ color: value });
  }

  function handleOpacityChange(value: number) {
    onchange?.({ opacity: value });
  }
</script>

<div class="layer-config-content">
  <div class="control-group">
    <span class="field-label">
      <Mountain size={16} />
      {m.basemap_config_representation()}
    </span>
    <Dropdown
      size="sm"
      selectedId={representation}
      items={getRepresentationOptions()}
      on:select={handleRepresentationChange}
    />
  </div>

  <ColorDropdown value={color} onchange={handleColorChange} />

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
