<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { Dropdown } from 'carbon-components-svelte';
  import { SliderWithInput } from '../shared';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapRepresentation
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    createLayerConfigSelectedIdHandler,
    createLayerConfigValueHandler
  } from './layer-config-handlers.utils';

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
    color = '#e0e0e0',
    opacity = 100,
    onchange
  }: Props = $props();

  const getOnChange = () => onchange;
  const handleRepresentationChange =
    createLayerConfigSelectedIdHandler<BasemapRepresentation>(
      getOnChange,
      'representation',
      (selectedId) => selectedId as BasemapRepresentation
    );
  const handleColorChange = createLayerConfigValueHandler<string>(
    getOnChange,
    'color'
  );
  const handleOpacityChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'opacity'
  );
</script>

<div class="layer-config-content">
  <div class="control-group">
    <span class="field-label">{m.basemap_config_representation()}</span>
    <Dropdown
      size="sm"
      selectedId={representation}
      items={getRepresentationOptions()}
      on:select={handleRepresentationChange}
    />
  </div>

  <SingleColorPreview
    label={m.basemap_config_color()}
    color={color}
    onchange={handleColorChange}
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
