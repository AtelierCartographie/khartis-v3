<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import { GeoreferenceType } from '$lib/features/commons/constants/ui.constants';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox } from 'carbon-components-svelte';
  import ChartTSne from 'carbon-icons-svelte/lib/ChartTSne.svelte';
  import { List } from 'carbon-icons-svelte';
  import type { GeocodeColumnItem, GeocodeFieldProps } from '../types';

  interface Props {
    referenceMode: GeoreferenceType;
    onReferenceModeChange: (mode: GeoreferenceType) => void;
    layout: 'single' | 'paired';
    primary: GeocodeFieldProps;
    paired?: GeocodeFieldProps;
    longitude?: GeocodeFieldProps;
    latitude?: GeocodeFieldProps;
    showCoordinatesTab?: boolean;
    referenceLabel?: string;
    referenceInfoText?: string;
    isCompact?: boolean;
  }

  let {
    referenceMode,
    onReferenceModeChange,
    layout,
    primary,
    paired,
    longitude,
    latitude,
    showCoordinatesTab = true,
    referenceLabel,
    referenceInfoText,
    isCompact = false
  }: Props = $props();

  const tabItems = $derived(
    showCoordinatesTab
      ? [
          { icon: List, label: m.geo_entities_tab(), iconSize: 16 },
          { icon: ChartTSne, label: m.geo_coordinates_tab(), iconSize: 16 }
        ]
      : [{ icon: List, label: m.geo_entities_tab(), iconSize: 16 }]
  );

  const activeTabIndex = $derived(
    referenceMode === GeoreferenceType.COORDINATES ? 1 : 0
  );

  function handleTabChange(index: number): void {
    onReferenceModeChange(
      index === 1 ? GeoreferenceType.COORDINATES : GeoreferenceType.ENTITIES
    );
  }

  function handleComboSelect(
    field: GeocodeFieldProps,
    detail: { selectedId: number; selectedItem: unknown }
  ): void {
    const item = detail.selectedItem as GeocodeColumnItem | null;
    if (!item) return;
    field.onSelect(detail.selectedId, item.columnName);
  }
</script>

{#snippet comboField(field: GeocodeFieldProps)}
  <div class="geocode-field">
    <span class="field-label">
      {field.label}
      {#if field.infoText}
        <InfoPopover text={field.infoText} />
      {/if}
    </span>
    <div class="combobox-with-badge">
      <ComboBox
        items={field.items}
        selectedId={field.selectedId}
        on:select={(e) => handleComboSelect(field, e.detail)}
        placeholder={field.placeholder ?? ''}
        labelText=""
        size="sm"
      />
      {#if field.selectedColumnName}
        <div class="badge-overlay">
          <VariableBadge
            label={field.selectedColumnName}
            type={field.badgeType ?? 'geo-ref'}
          />
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<div class="geocode-settings" class:compact={isCompact}>
  <div class="reference-mode-row">
    <span class="field-label">
      {referenceLabel ?? m.geo_reference()}
      {#if referenceInfoText}
        <InfoPopover text={referenceInfoText} />
      {/if}
    </span>
    <ToggleTabs
      activeIndex={activeTabIndex}
      items={tabItems}
      onChange={handleTabChange}
      className="geocode-tabs"
    />
  </div>

  {#if referenceMode !== GeoreferenceType.COORDINATES}
    {#if layout === 'paired' && paired}
      <div class="paired-fields">
        {@render comboField(primary)}
        <span class="paired-separator" aria-hidden="true"
          >{m.separator_double_arrow()}</span
        >
        {@render comboField(paired)}
      </div>
    {:else}
      {@render comboField(primary)}
    {/if}
  {:else}
    <div class="coords-fields" class:compact={isCompact}>
      {#if longitude}
        {@render comboField(longitude)}
      {/if}
      {#if latitude}
        {@render comboField(latitude)}
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .geocode-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .reference-mode-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    font-weight: 400;
  }

  .geocode-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .paired-fields {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .paired-separator {
    flex-shrink: 0;
    font-size: 1.25rem;
    color: var(--cds-text-secondary, #525252);
    margin-bottom: 6px;
  }

  .coords-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .coords-fields.compact {
    grid-template-columns: 1fr;
  }

  .combobox-with-badge {
    position: relative;
  }

  .badge-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 40px;
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    pointer-events: none;
    z-index: var(--z-base);
  }

  .combobox-with-badge:has(.badge-overlay) :global(.bx--text-input) {
    color: transparent;
  }

  .combobox-with-badge:has(.badge-overlay) :global(.bx--list-box__selection) {
    opacity: 0;
  }

  .combobox-with-badge:focus-within .badge-overlay {
    display: none;
  }

  .combobox-with-badge:focus-within :global(.bx--text-input) {
    color: inherit !important;
  }

  .combobox-with-badge:focus-within :global(.bx--list-box__selection) {
    opacity: 1 !important;
  }

  :global(.geocode-tabs) {
    width: 100%;
    max-width: none;
  }

  :global(.geocode-tabs .toggle-tab) {
    height: 32px;
  }

  :global(.geocode-tabs .toggle-tab.active) {
    background-color: var(--cds-border-subtle-01);
  }
</style>
