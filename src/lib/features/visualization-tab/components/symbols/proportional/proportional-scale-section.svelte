<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { InfoPopover, SliderWithInput } from '../../shared';
  import FacetsVariablePicker from '../../shared/facets-variable-picker.svelte';
  import { SLIDER_LIMITS } from '$lib/features/commons/constants/visualization.constants';
  import type { FacetSlotPath } from '../../../adapters/facets-adapter';

  interface FieldSelection {
    selectedFieldId: number;
  }

  interface FacetsSelection {
    getSelectedFieldIds(slot: FacetSlotPath): number[];
    isActiveForSlot(slot: FacetSlotPath): boolean;
    updateVariables(column: string, slot: FacetSlotPath, ids: number[]): void;
    toggle(
      column: string,
      slot: FacetSlotPath,
      enabled: boolean,
      fieldIds?: number[]
    ): void;
  }

  interface DropdownItem {
    id: string;
    text: string;
  }

  interface Props {
    dataFields: Array<{ id: number; text: string; type?: string }>;
    selectableNumericDataFields: Array<{
      id: number;
      text: string;
      type?: string;
    }>;
    primaryFieldSelection: FieldSelection;
    facetsSelection: FacetsSelection;
    facetSlot: FacetSlotPath;
    columnName: string;
    shapeDropdownItems: Array<DropdownItem>;
    shapeType: string;
    pickerOpen: boolean;
    symbolMaxSize: number;
    onFieldSelect: (id: number) => void;
    onMaxSizeChange: (value: number) => void;
    onShapeDropdownSelect: (value: string | number) => void;
    midContent?: Snippet;
  }

  let {
    dataFields,
    selectableNumericDataFields,
    primaryFieldSelection,
    facetsSelection,
    facetSlot,
    columnName,
    shapeDropdownItems,
    shapeType,
    pickerOpen = $bindable(),
    symbolMaxSize = $bindable(),
    onFieldSelect,
    onMaxSizeChange,
    onShapeDropdownSelect,
    midContent
  }: Props = $props();
</script>

<div class="field-group">
  <span class="field-label">
    {m.size_according()}
    <InfoPopover text={m.size_according_info()} />
  </span>
  <FacetsVariablePicker
    bind:open={pickerOpen}
    dataFields={dataFields}
    singleSelectItems={selectableNumericDataFields}
    selectedFieldId={primaryFieldSelection.selectedFieldId}
    selectedFieldIds={facetsSelection.getSelectedFieldIds(facetSlot)}
    isCollectionEnabled={facetsSelection.isActiveForSlot(facetSlot)}
    onSelect={onFieldSelect}
    onCollectionChange={(ids) =>
      facetsSelection.updateVariables(columnName, facetSlot, ids)}
    onToggleCollection={(enabled, ids) =>
      facetsSelection.toggle(columnName, facetSlot, enabled, ids)}
  />
</div>

<SliderWithInput
  label={m.max_size()}
  infoText={m.max_size_info()}
  bind:value={symbolMaxSize}
  min={SLIDER_LIMITS.symbolMaxSize.min}
  max={SLIDER_LIMITS.symbolMaxSize.max}
  step={SLIDER_LIMITS.symbolMaxSize.step}
  onchange={onMaxSizeChange}
/>

{#if midContent}{@render midContent()}{/if}

<div class="field-group">
  <span class="field-label">
    {m.shape()}
    <InfoPopover text={m.shape_info()} />
  </span>
  <Dropdown
    size="sm"
    items={shapeDropdownItems}
    selectedId={shapeType}
    on:select={(e) => onShapeDropdownSelect(e.detail.selectedId)}
    type="default"
  />
</div>
