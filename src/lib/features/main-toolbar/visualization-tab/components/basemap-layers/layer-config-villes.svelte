<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    RadioButtonGroup,
    RadioButton,
    Dropdown
  } from 'carbon-components-svelte';
  import ColorDropdown from './color-dropdown.svelte';
  import { SliderWithInput } from '../shared';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapCityCategory,
    BasemapCitySymbol
  } from '../../../constants';

  interface SymbolOption {
    id: BasemapCitySymbol;
    text: string;
  }

  interface Props {
    category?: BasemapCityCategory;
    symbol?: BasemapCitySymbol;
    color?: string;
    size?: number;
    opacity?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  function getSymbolOptions(): SymbolOption[] {
    return [
      { id: BasemapCitySymbol.POINT, text: m.basemap_config_symbol_point() },
      { id: BasemapCitySymbol.SQUARE, text: m.basemap_config_symbol_square() },
      {
        id: BasemapCitySymbol.DIAMOND,
        text: m.basemap_config_symbol_diamond()
      },
      { id: BasemapCitySymbol.STAR, text: m.basemap_config_symbol_star() }
    ];
  }

  let {
    category = BasemapCityCategory.CAPITALS,
    symbol = BasemapCitySymbol.POINT,
    color = '#525252',
    size = 8,
    opacity = 100,
    onchange
  }: Props = $props();

  function handleCategoryChange(e: CustomEvent<string | number>) {
    const next = String(e.detail) as BasemapCityCategory;
    if (next === category) return;
    onchange?.({ category: next });
  }

  function handleSymbolChange(e: CustomEvent<{ selectedId: string }>) {
    onchange?.({ symbol: e.detail.selectedId as BasemapCitySymbol });
  }

  function handleColorChange(value: string) {
    onchange?.({ color: value });
  }

  function handleSizeChange(value: number) {
    onchange?.({ size: value });
  }

  function handleOpacityChange(value: number) {
    onchange?.({ opacity: value });
  }
</script>

<div class="layer-config-content">
  <div class="control-group">
    <RadioButtonGroup
      legendText={m.basemap_config_category()}
      selected={category}
      on:change={handleCategoryChange}
    >
      <RadioButton
        labelText={m.basemap_config_category_capitals()}
        value={BasemapCityCategory.CAPITALS}
      />
      <RadioButton
        labelText={m.basemap_config_category_100k()}
        value={BasemapCityCategory.POP_100K}
      />
      <RadioButton
        labelText={m.basemap_config_category_250k()}
        value={BasemapCityCategory.POP_250K}
      />
      <RadioButton
        labelText={m.basemap_config_category_500k()}
        value={BasemapCityCategory.POP_500K}
      />
    </RadioButtonGroup>
  </div>

  <div class="control-group">
    <span class="field-label">{m.basemap_config_symbol()}</span>
    <Dropdown
      size="sm"
      selectedId={symbol}
      items={getSymbolOptions()}
      on:select={handleSymbolChange}
    />
  </div>

  <ColorDropdown value={color} onchange={handleColorChange} />

  <SliderWithInput
    label={m.basemap_config_size()}
    min={BASEMAP_LAYER_CONFIG.size.min}
    max={BASEMAP_LAYER_CONFIG.size.max}
    value={size}
    onchange={handleSizeChange}
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
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .layer-config-content :global(.cds--radio-button-group) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
