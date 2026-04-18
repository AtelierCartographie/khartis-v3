<script lang="ts">
  import {
    Dropdown,
    RadioButton,
    RadioButtonGroup
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import { DEFAULT_QUALITATIVE_PREVIEW } from '../palette-popover/palette.constants';
  import {
    CategoryShapeMode,
    MissingDataShape,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    DEFAULT_COLORS,
    availableShapesForSymbolMode
  } from '../../../constants';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SliderWithInput
  } from '../shared';
  import type { SymbolModeProps } from './types';

  let {
    dataFields = [],
    visualization,
    onMappingChange,
    onSymbolsChange,
    onModesChange,
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
  let symbolOpacity = $state<number>(100);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let categoryShapeMode = $state<CategoryShapeMode>(CategoryShapeMode.UNIQUE);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

  const availableShapes = availableShapesForSymbolMode(SymbolMode.CATEGORIES);

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

  const shapeDropdownItems = $derived(
    availableShapes.map((type) => ({
      id: type,
      text: shapeLabelByType[type]()
    }))
  );

  function handleShapeDropdownSelect(value: string | number) {
    const next =
      availableShapes.find((type) => type === value) ?? ShapeType.CIRCLE;
    shapeType = next;
    onSymbolsChange?.({ type: next });
  }

  function handleCategoryShapeModeChange(next: CategoryShapeMode) {
    if (next === categoryShapeMode) return;
    categoryShapeMode = next;
    onModesChange?.({ categoryShape: next });
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
          : 100;
      const persistedShape = visualization.symbols.type ?? ShapeType.CIRCLE;
      shapeType = availableShapes.includes(persistedShape)
        ? persistedShape
        : ShapeType.CIRCLE;
    } else {
      symbolOpacity = 100;
    }
    if (visualization?.modes?.categoryShape) {
      categoryShapeMode = visualization.modes.categoryShape;
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

<div class="field-group">
  <span class="field-label">
    {m.size_according()}
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
    {m.category_shape_mode_label()}
    <InfoPopover text={m.category_shape_mode_info()} />
  </span>
  <RadioButtonGroup
    selected={categoryShapeMode}
    on:change={(e) =>
      handleCategoryShapeModeChange(e.detail as CategoryShapeMode)}
  >
    <RadioButton
      id="cat-shape-unique"
      value={CategoryShapeMode.UNIQUE}
      labelText={m.category_shape_mode_unique()}
    />
    <RadioButton
      id="cat-shape-different"
      value={CategoryShapeMode.DIFFERENT}
      labelText={m.category_shape_mode_different()}
    />
    <RadioButton
      id="cat-shape-ordered"
      value={CategoryShapeMode.ORDERED}
      labelText={m.category_shape_mode_ordered()}
    />
  </RadioButtonGroup>
</div>

{#if categoryShapeMode === CategoryShapeMode.UNIQUE}
  <div class="field-group">
    <span class="field-label">
      {m.shape()}
      <InfoPopover text={m.shape_info()} />
    </span>
    <Dropdown
      items={shapeDropdownItems}
      selectedId={shapeType}
      on:select={(e) => handleShapeDropdownSelect(e.detail.selectedId)}
      type="default"
    />
  </div>
{/if}

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

  :global(.field-group .bx--radio-button-group) {
    flex-direction: row;
  }
</style>
