<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    MissingDataShape,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS
  } from '../../../constants';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SectionHeading,
    SliderWithInput
  } from '../shared';
  import type { SymbolModeProps } from './types';

  let {
    dataFields = [],
    visualization,
    onMappingChange,
    onSymbolsChange,
    onMissingDataChange,
    onClassificationChange,
    onInvertPalette,
    onOpenDiscretization
  }: SymbolModeProps = $props();

  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

  let selectedFieldId = $state<number>(0);
  let categoryCount = $state<number>(4);
  let symbolOpacity = $state<number>(VISUALIZATION_DEFAULTS.symbolOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);

  $effect(() => {
    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.categoryColumn
      );
      if (fieldIndex >= 0) {
        selectedFieldId = dataFields[fieldIndex].id;
      }
    }

    if (visualization?.symbols) {
      symbolOpacity =
        visualization.symbols.opacity !== undefined
          ? Math.round(visualization.symbols.opacity * 100)
          : VISUALIZATION_DEFAULTS.symbolOpacity;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
      missingDataSize = visualization.missingData.size ?? 2;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
  });

  function handleMissingDataShowChange(show: boolean) {
    showMissingData = show;
    onMissingDataChange?.({ show });
  }

  function handleMissingDataShapeChange(shape: MissingDataShape) {
    missingDataShape = shape;
    onMissingDataChange?.({ shape });
  }

  function handleMissingDataSizeChange(size: number) {
    missingDataSize = size;
    onMissingDataChange?.({ size });
  }

  function handleMissingDataColorChange(color: string) {
    missingDataColor = color;
    onMissingDataChange?.({ color });
  }

  function handleFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
    const field = dataFields.find((f) => f.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  function handleOpacityChange(value: number) {
    symbolOpacity = value;
    onSymbolsChange?.({ opacity: value / 100 });
  }
</script>

<SectionHeading title={m.size_and_color()} />

<div class="field-group">
  <span class="field-label">
    {m.viz_symbols_select_criteria()}
    <InfoPopover text={m.category_variable_info()} />
  </span>
  <Dropdown
    items={dataFields}
    selectedId={selectedFieldId}
    on:select={(e) => handleFieldSelect(e.detail.selectedId)}
    type="default"
  />
</div>

<DiscretizationRow
  label={m.category_aspect()}
  value={m.categories_count({ count: categoryCount })}
  onsettings={onOpenDiscretization}
/>
<PalettePreview
  label={m.color_palette()}
  colors={qualitativePalette}
  oninvert={onInvertPalette}
  onClassificationChange={onClassificationChange}
/>
<SliderWithInput
  label={m.opacity()}
  bind:value={symbolOpacity}
  min={SLIDER_LIMITS.opacity.min}
  max={SLIDER_LIMITS.opacity.max}
  onchange={handleOpacityChange}
/>

<MissingDataSection
  bind:show={showMissingData}
  color={missingDataColor}
  shape={missingDataShape}
  size={missingDataSize}
  onshowchange={handleMissingDataShowChange}
  onshapechange={handleMissingDataShapeChange}
  onsizechange={handleMissingDataSizeChange}
  oncolorchange={handleMissingDataColorChange}
/>

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }
</style>
