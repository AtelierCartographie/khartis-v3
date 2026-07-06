<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { Dropdown } from 'carbon-components-svelte';
  import { SectionHeading, SliderWithInput } from '../shared';
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
  import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
  import {
    createLayerConfigSelectedIdHandler,
    createLayerConfigValueHandler
  } from './layer-config-handlers.utils';

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
    color = NEUTRAL_CARTOGRAPHY_COLORS.city,
    size = 8,
    opacity = 100,
    labelFontFamily = CARTOGRAPHIC_FONT_FAMILY,
    labelSize = DEFAULT_LABEL_SIZE,
    labelColor = NEUTRAL_CARTOGRAPHY_COLORS.cityLabel,
    onchange
  }: Props = $props();

  const getOnChange = () => onchange;
  const handleSymbolChange =
    createLayerConfigSelectedIdHandler<BasemapCitySymbol>(
      getOnChange,
      'symbol',
      (selectedId) => selectedId as BasemapCitySymbol
    );
  const handleCountChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'count'
  );
  const handleColorChange = createLayerConfigValueHandler<string>(
    getOnChange,
    'color'
  );
  const handleSizeChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'size'
  );
  const handleOpacityChange = createLayerConfigValueHandler<number>(
    getOnChange,
    'opacity'
  );
  const handleLabelFontFamilyChange =
    createLayerConfigSelectedIdHandler<string>(
      getOnChange,
      'labelFontFamily',
      (selectedId) => selectedId
    );
  const handleLabelSizeChange = createLayerConfigSelectedIdHandler<number>(
    getOnChange,
    'labelSize',
    (selectedId) => clampFontSize(selectedId)
  );
  const handleLabelColorChange = createLayerConfigValueHandler<string>(
    getOnChange,
    'labelColor'
  );
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

  <SectionHeading title={m.basemap_config_labels()} />

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
