<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import {
    CaretUp,
    Checkbox,
    CircleFilled,
    Close,
    DiamondFill,
    SquareFill,
    StarFilled
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import { DEFAULT_QUALITATIVE_PREVIEW } from '../palette-popover/palette.constants';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    MissingDataShape,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    availableShapesForSymbolMode
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

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );

  const NONE_FIELD_ID = -1;
  let selectedFieldId = $state<number>(NONE_FIELD_ID);
  let categoryCount = $state<number>(4);
  let symbolOpacity = $state<number>(VISUALIZATION_DEFAULTS.symbolOpacity);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

  const availableShapes = availableShapesForSymbolMode(SymbolMode.CATEGORIES);
  const shapeIconByType: Record<ShapeType, typeof CircleFilled> = {
    [ShapeType.CIRCLE]: CircleFilled,
    [ShapeType.SQUARE]: SquareFill,
    [ShapeType.CROSS]: Close,
    [ShapeType.DIAMOND]: DiamondFill,
    [ShapeType.TRIANGLE]: CaretUp,
    [ShapeType.STAR]: StarFilled,
    [ShapeType.RECTANGLE]: Checkbox,
    [ShapeType.BAR]: CircleFilled,
    [ShapeType.SPIKE]: CircleFilled
  };
  const shapeLabelByType: Record<ShapeType, () => string> = {
    [ShapeType.CIRCLE]: m.shape_circle,
    [ShapeType.SQUARE]: m.shape_square,
    [ShapeType.CROSS]: m.shape_cross,
    [ShapeType.DIAMOND]: m.shape_diamond,
    [ShapeType.TRIANGLE]: m.shape_triangle,
    [ShapeType.STAR]: m.shape_star,
    [ShapeType.RECTANGLE]: m.shape_rectangle,
    [ShapeType.BAR]: m.shape_bar,
    [ShapeType.SPIKE]: m.shape_spike
  };
  const shapeItems = availableShapes.map((shape) => ({
    icon: shapeIconByType[shape],
    label: shapeLabelByType[shape](),
    iconSize: 16
  }));

  const shapeIndex = $derived(availableShapes.indexOf(shapeType));

  function handleShapeTabChange(index: number) {
    const next = availableShapes[index] ?? ShapeType.CIRCLE;
    shapeType = next;
    onSymbolsChange?.({ type: next });
  }

  $effect(() => {
    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.categoryColumn
      );
      selectedFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedFieldId = NONE_FIELD_ID;
    }

    if (visualization?.symbols) {
      symbolOpacity =
        visualization.symbols.opacity !== undefined
          ? Math.round(visualization.symbols.opacity * 100)
          : VISUALIZATION_DEFAULTS.symbolOpacity;
      const persistedShape = visualization.symbols.type ?? ShapeType.CIRCLE;
      shapeType = availableShapes.includes(persistedShape)
        ? persistedShape
        : ShapeType.CIRCLE;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
      missingDataSize = visualization.missingData.size ?? 2;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
    if (visualization?.classification) {
      categoryCount =
        visualization.classification.labels?.length ??
        visualization.classification.numClasses ??
        visualization.classification.classes ??
        4;
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
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

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
    items={selectableDataFields}
    selectedId={selectedFieldId}
    on:select={(e) => handleFieldSelect(e.detail.selectedId)}
    type="default"
  />
</div>

<div class="field-group">
  <span class="field-label">
    {m.viz_symbols_representation()}
    <InfoPopover text={m.shape_info()} />
  </span>
  <ToggleTabs
    items={shapeItems}
    activeIndex={shapeIndex}
    onChange={handleShapeTabChange}
    hideInactiveLabel={true}
  />
</div>

<DiscretizationRow
  label={m.category_aspect()}
  value={m.categories_count({ count: categoryCount })}
  onsettings={onOpenDiscretization}
/>
<PalettePreview
  label={m.color_palette()}
  colors={currentPalette}
  selectedPaletteId={visualization?.classification?.paletteId}
  inverted={visualization?.classification?.inverted ?? false}
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
