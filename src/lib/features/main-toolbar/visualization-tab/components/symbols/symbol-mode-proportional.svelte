<script lang="ts">
  import {
    Dropdown,
    RadioButton,
    RadioButtonGroup,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    MissingDataShape,
    ProportionalType,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS
  } from '../../../constants';
  import {
    DiscretizationRow,
    MissingDataSection,
    SliderWithInput
  } from '../shared';
  import type { SymbolModeProps } from './types';

  interface Props extends SymbolModeProps {
    symbolMode: SymbolMode.PROPORTIONAL | SymbolMode.CLASSES;
  }

  let {
    dataFields = [],
    visualization,
    symbolMode,
    onSymbolsChange,
    onMissingDataChange,
    onOpenDiscretization
  }: Props = $props();

  let proportionalType = $state<ProportionalType>(ProportionalType.SINGLE);
  let selectedFieldId = $state<number>(0);
  let symbolMaxSize = $state<number>(VISUALIZATION_DEFAULTS.symbolMaxSize);
  let shapeType = $state<ShapeType>(ShapeType.POINT);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);

  $effect(() => {
    if (visualization?.symbols) {
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      shapeType = visualization.symbols.type ?? ShapeType.POINT;
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

  const discretizationLabel = $derived.by(() => {
    if (!visualization?.classification) return m.discretization_method_jenks();
    const numClasses =
      visualization.classification.numClasses ??
      visualization.classification.classes ??
      5;
    return `${m.discretization_method_quantile()}, ${numClasses} ${m.discretization_num_classes().toLowerCase()}`;
  });

  function handleShapeTypeChange(value: ShapeType) {
    shapeType = value;
    onSymbolsChange?.({ type: value });
  }

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
</script>

<div class="field-group">
  <RadioButtonGroup
    legendText={m.proportional_symbols_label()}
    bind:selected={proportionalType}
  >
    <RadioButton
      id="prop-single"
      value={ProportionalType.SINGLE}
      labelText={m.unique()}
    />
    <RadioButton
      id="prop-double"
      value={ProportionalType.DOUBLE}
      labelText={m.double()}
    />
  </RadioButtonGroup>
</div>

<div class="field-group">
  <Dropdown
    titleText={m.size_according()}
    items={dataFields}
    bind:selectedId={selectedFieldId}
    type="default"
  />
</div>

<SliderWithInput
  label={m.max_size()}
  bind:value={symbolMaxSize}
  min={SLIDER_LIMITS.symbolMaxSize.min}
  max={100}
/>

{#if symbolMode === SymbolMode.CLASSES}
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel}
    onsettings={onOpenDiscretization}
  />
{/if}

<div class="field-group">
  <Select
    id="shape-prop"
    labelText={m.shape()}
    selected={shapeType}
    on:change={(e) => {
      const target = e.target as HTMLSelectElement;
      handleShapeTypeChange(target.value as ShapeType);
    }}
  >
    <SelectItem value={ShapeType.POINT} text={m.point()} />
    <SelectItem value={ShapeType.SQUARE} text={m.square()} />
    <SelectItem value={ShapeType.TRIANGLE} text={m.triangle()} />
  </Select>
</div>

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

  :global(.field-group .bx--radio-button-group) {
    flex-direction: row;
  }
</style>
