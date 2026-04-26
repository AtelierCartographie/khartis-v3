<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { InfoPopover, SliderWithInput } from '../../shared';
  import FacetsVariablePicker from '../facets-variable-picker.svelte';
  import BreakValueInput from './break-value-input.svelte';
  import { SLIDER_LIMITS, type ShapeType } from '../../../../constants';
  import { FACET_SLOT, type FacetSlotPath } from '../../../facets-adapter';

  interface FieldSelection {
    selectedFieldId: number;
    selectedFieldName: string | undefined;
  }

  interface FacetsSelection {
    getSelectedFieldIds(slot: FacetSlotPath): number[];
    isActiveForSlot(slot: FacetSlotPath): boolean;
    updateVariables(column: string, slot: FacetSlotPath, ids: number[]): void;
    toggle(column: string, slot: FacetSlotPath, enabled: boolean): void;
  }

  interface DropdownItem {
    id: string;
    text: string;
  }

  interface Props {
    commonScale: boolean;
    symbolMaxSize: number;
    shapeType: ShapeType;
    positionMode: string;
    breakValueA: number | null;
    breakValueB: number | null;
    sizeColumnName: string;
    sizePickerOpen: boolean;
    fieldBPickerOpen: boolean;
    dataFields: Array<{ id: number; text: string; type?: string }>;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    primaryFieldSelection: FieldSelection;
    secondaryValueFieldSelection: FieldSelection;
    facetsSelection: FacetsSelection;
    shapeDropdownItems: Array<{ id: string; text: string }>;
    positionModeItems: DropdownItem[];
    onCommonScaleChange: (value: boolean) => void;
    onFieldSelect: (id: number) => void;
    onFieldBSelect: (id: number) => void;
    onSymbolMaxSizeChange: (value: number) => void;
    onShapeDropdownSelect: (id: string | number) => void;
    onPositionModeChange: (id: string | number) => void;
    onBreakValueAChange: (value: number | null) => void;
    onBreakValueBChange: (value: number | null) => void;
  }

  let {
    commonScale,
    symbolMaxSize = $bindable(),
    shapeType,
    positionMode,
    breakValueA,
    breakValueB,
    sizeColumnName,
    sizePickerOpen = $bindable(),
    fieldBPickerOpen = $bindable(),
    dataFields,
    selectableDataFields,
    primaryFieldSelection,
    secondaryValueFieldSelection,
    facetsSelection,
    shapeDropdownItems,
    positionModeItems,
    onCommonScaleChange,
    onFieldSelect,
    onFieldBSelect,
    onSymbolMaxSizeChange,
    onShapeDropdownSelect,
    onPositionModeChange,
    onBreakValueAChange,
    onBreakValueBChange
  }: Props = $props();
</script>

<div class="field-group">
  <span class="field-label">
    {m.common_scale_label()}
    <InfoPopover text={m.common_scale_info()} />
  </span>
  <Switch
    toggled={commonScale}
    labelText={m.common_scale_label()}
    hideLabel
    onchange={onCommonScaleChange}
  />
</div>

<div class="field-group">
  <span class="field-label">
    {m.symbol_a_size_according()}
    <InfoPopover text={m.size_according_info()} />
  </span>
  <FacetsVariablePicker
    bind:open={sizePickerOpen}
    dataFields={dataFields}
    singleSelectItems={selectableDataFields}
    selectedFieldId={primaryFieldSelection.selectedFieldId}
    selectedFieldIds={facetsSelection.getSelectedFieldIds(
      FACET_SLOT.SYMBOL_SIZE
    )}
    isCollectionEnabled={facetsSelection.isActiveForSlot(
      FACET_SLOT.SYMBOL_SIZE
    )}
    onSelect={onFieldSelect}
    onCollectionChange={(ids) =>
      facetsSelection.updateVariables(
        sizeColumnName,
        FACET_SLOT.SYMBOL_SIZE,
        ids
      )}
    onToggleCollection={(enabled) =>
      facetsSelection.toggle(sizeColumnName, FACET_SLOT.SYMBOL_SIZE, enabled)}
  />
</div>

<div class="field-group">
  <span class="field-label">
    {m.symbol_b_size_according()}
  </span>
  <FacetsVariablePicker
    bind:open={fieldBPickerOpen}
    dataFields={dataFields}
    singleSelectItems={selectableDataFields}
    selectedFieldId={secondaryValueFieldSelection.selectedFieldId}
    isCollectionEnabled={false}
    showCollectionFooter={false}
    onSelect={onFieldBSelect}
  />
</div>

<SliderWithInput
  label={m.max_size()}
  infoText={m.max_size_info()}
  bind:value={symbolMaxSize}
  min={SLIDER_LIMITS.symbolMaxSize.min}
  max={SLIDER_LIMITS.symbolMaxSize.max}
  step={SLIDER_LIMITS.symbolMaxSize.step}
  onchange={onSymbolMaxSizeChange}
/>

<div class="field-group">
  <span class="field-label">
    {m.shape()}
    <InfoPopover text={m.shape_info()} />
  </span>
  <Dropdown
    items={shapeDropdownItems}
    selectedId={shapeType}
    on:select={(e) => onShapeDropdownSelect(e.detail.selectedId)}
    type="default"
  />
</div>

<div class="field-group">
  <span class="field-label">
    {m.symbol_position_mode()}
    <InfoPopover text={m.position_mode_info()} />
  </span>
  <Dropdown
    items={positionModeItems}
    selectedId={positionMode}
    on:select={(e) => onPositionModeChange(e.detail.selectedId)}
    type="default"
  />
</div>

<BreakValueInput
  label={m.symbol_a_break_value()}
  infoText={m.break_value_info()}
  value={breakValueA}
  onchange={onBreakValueAChange}
/>

<BreakValueInput
  label={m.symbol_b_break_value()}
  value={breakValueB}
  onchange={onBreakValueBChange}
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
