<script lang="ts">
  import FontFamilySelect from '$lib/features/step-toolbar/font-family-select.svelte';
  import * as m from '$lib/paraglide/messages';
  import { translateCarbonId } from '$lib/features/commons/utils/carbon-a11y.utils';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import { Dropdown } from 'carbon-components-svelte';
  import {
    CARTOGRAPHIC_FONT_FAMILY,
    clampFontSize,
    FONT_SIZE_OPTIONS
  } from '$lib/features/step-toolbar/fonts.constants';
  import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
  import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
  import {
    createLayerConfigSelectedIdHandler,
    createLayerConfigValueHandler
  } from './layer-config-handlers.utils';

  interface Props {
    color?: string;
    labelFontFamily?: string;
    labelSize?: number;
    onchange?: (updates: Record<string, unknown>) => void;
  }

  const DEFAULT_LABEL_SIZE = PRINT_STANDARD_TOKENS.annotations.captionFontSize;

  let {
    color = NEUTRAL_CARTOGRAPHY_COLORS.cityLabel,
    labelFontFamily = CARTOGRAPHIC_FONT_FAMILY,
    labelSize = DEFAULT_LABEL_SIZE,
    onchange
  }: Props = $props();

  const fontSizeOptions = FONT_SIZE_OPTIONS.map((fontSize) => ({
    id: fontSize,
    text: fontSize
  }));

  const getOnChange = () => onchange;
  const handleSizeChange = createLayerConfigSelectedIdHandler<number>(
    getOnChange,
    'labelSize',
    (selectedId) => clampFontSize(selectedId)
  );
  const handleColorChange = createLayerConfigValueHandler<string>(
    getOnChange,
    'color'
  );
</script>

<div class="layer-config-content">
  <div class="label-style-row">
    <div class="label-font-control">
      <FontFamilySelect
        labelText={m.basemap_config_label_font()}
        value={labelFontFamily}
        fallback={CARTOGRAPHIC_FONT_FAMILY}
        onchange={(font) => getOnChange()?.({ labelFontFamily: font })}
      />
    </div>

    <div class="label-size-control">
      <Dropdown
        translateWithId={translateCarbonId}
        translateWithIdSelection={translateCarbonId}
        size="sm"
        titleText={m.basemap_config_label_size()}
        selectedId={String(clampFontSize(labelSize, DEFAULT_LABEL_SIZE))}
        items={fontSizeOptions}
        on:select={handleSizeChange}
      />
    </div>
  </div>

  <SingleColorPreview
    label={m.basemap_config_color()}
    color={color}
    allowPattern={false}
    onchange={handleColorChange}
  />
</div>

<style lang="scss">
  .layer-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
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
