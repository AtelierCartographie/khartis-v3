<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { Dropdown } from 'carbon-components-svelte';
  import { SliderWithInput } from '../shared';
  import {
    AVAILABLE_FONTS,
    CARTOGRAPHIC_FONT_FAMILY,
    FONT_SIZE_OPTIONS,
    clampFontSize,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/fonts.constants';
  import {
    BASEMAP_LAYER_CONFIG,
    BasemapCitySymbol
  } from '$lib/features/commons/constants/visualization.constants';

  interface SymbolOption {
    id: BasemapCitySymbol;
    text: string;
  }

  interface SelectOption {
    id: string;
    text: string;
  }

  interface Props {
    count?: number;
    symbol?: BasemapCitySymbol;
    color?: string;
    size?: number;
    opacity?: number;
    labelFontFamily?: string;
    labelSize?: number;
    labelColor?: string;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  const DEFAULT_CITY_COUNT = 50;
  const DEFAULT_LABEL_SIZE = 12;

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

  function getFontOptions(): SelectOption[] {
    return AVAILABLE_FONTS.map((fontFamily) => ({
      id: fontFamily,
      text: fontFamily
    }));
  }

  function getFontSizeOptions(): SelectOption[] {
    return FONT_SIZE_OPTIONS.map((fontSize) => ({
      id: fontSize,
      text: fontSize
    }));
  }

  let {
    count = DEFAULT_CITY_COUNT,
    symbol = BasemapCitySymbol.POINT,
    color = '#525252',
    size = 8,
    opacity = 100,
    labelFontFamily = CARTOGRAPHIC_FONT_FAMILY,
    labelSize = DEFAULT_LABEL_SIZE,
    labelColor = '#161616',
    onchange
  }: Props = $props();

  function handleSymbolChange(e: CustomEvent<{ selectedId: string }>) {
    onchange?.({ symbol: e.detail.selectedId as BasemapCitySymbol });
  }

  function handleCountChange(value: number) {
    onchange?.({ count: value });
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

  function handleLabelFontFamilyChange(e: CustomEvent<{ selectedId: string }>) {
    onchange?.({ labelFontFamily: e.detail.selectedId });
  }

  function handleLabelSizeChange(e: CustomEvent<{ selectedId: string }>) {
    onchange?.({ labelSize: clampFontSize(e.detail.selectedId) });
  }

  function handleLabelColorChange(value: string) {
    onchange?.({ labelColor: value });
  }
</script>

<div class="layer-config-content">
  <SliderWithInput
    label={m.basemap_config_city_count()}
    min={BASEMAP_LAYER_CONFIG.cityCount.min}
    max={BASEMAP_LAYER_CONFIG.cityCount.max}
    step={BASEMAP_LAYER_CONFIG.cityCount.step}
    value={count}
    showMinMax
    inputWidth="64px"
    showSteppers={false}
    onchange={handleCountChange}
  />

  <div class="control-group">
    <span class="field-label">{m.basemap_config_symbol()}</span>
    <Dropdown
      size="sm"
      selectedId={symbol}
      items={getSymbolOptions()}
      on:select={handleSymbolChange}
    />
  </div>

  <SingleColorPreview
    label={m.basemap_config_color()}
    color={color}
    onchange={handleColorChange}
  />

  <SliderWithInput
    label={m.basemap_config_size()}
    min={BASEMAP_LAYER_CONFIG.size.min}
    max={BASEMAP_LAYER_CONFIG.size.max}
    step={BASEMAP_LAYER_CONFIG.size.step}
    value={size}
    showMinMax
    inputWidth="64px"
    showSteppers={false}
    onchange={handleSizeChange}
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

  <div class="section-heading">
    <span>{m.basemap_config_labels()}</span>
    <span aria-hidden="true"></span>
  </div>

  <div class="label-style-row">
    <div class="label-font-control">
      <Dropdown
        size="sm"
        titleText={m.basemap_config_label_font()}
        selectedId={normalizeFontFamily(labelFontFamily) ??
          CARTOGRAPHIC_FONT_FAMILY}
        items={getFontOptions()}
        on:select={handleLabelFontFamilyChange}
      />
    </div>

    <div class="label-size-control">
      <Dropdown
        size="sm"
        titleText={m.basemap_config_label_size()}
        selectedId={String(clampFontSize(labelSize, DEFAULT_LABEL_SIZE))}
        items={getFontSizeOptions()}
        on:select={handleLabelSizeChange}
      />
    </div>
  </div>

  <SingleColorPreview
    label={m.basemap_config_color()}
    color={labelColor}
    onchange={handleLabelColorChange}
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

  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary);
  }

  .section-heading span:first-child {
    flex: 0 0 auto;
  }

  .section-heading span:last-child {
    flex: 1 1 auto;
    height: 1px;
    background: var(--cds-border-subtle-01);
  }

  .label-style-row {
    display: flex;
    gap: var(--cds-spacing-03);
    align-items: flex-end;
  }

  .label-font-control {
    flex: 1 1 auto;
    min-width: 0;
  }

  .label-size-control {
    flex: 0 0 64px;
  }
</style>
