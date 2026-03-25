<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    RadioButtonGroup,
    RadioButton,
    Toggle
  } from 'carbon-components-svelte';
  import { InfoPopover } from './components/shared';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';

  const tiledBasemapOptions = [
    {
      value: BasemapStyle.CARTE_FACILE_DESATURATED,
      label: m.basemap_desaturated()
    },
    {
      value: BasemapStyle.CARTE_FACILE_SIMPLE,
      label: m.basemap_simple()
    },
    {
      value: BasemapStyle.CARTE_FACILE_AERIAL,
      label: m.basemap_aerial()
    }
  ];

  const selectedStyle = $derived(
    basemapStyleStore.selectedStyle !== BasemapStyle.BLANK_WHITE
      ? basemapStyleStore.selectedStyle
      : BasemapStyle.CARTE_FACILE_DESATURATED
  );

  function handleStyleChange(value: BasemapStyle): void {
    basemapStyleStore.setStyle(value);
  }

  function handleLabelsToggle(e: CustomEvent<{ toggled: boolean }>): void {
    basemapStyleStore.setShowLabels(e.detail.toggled);
  }
</script>

<div class="basemap-style-selector">
  <span class="field-label">
    {m.basemap_style_label()}
    <InfoPopover text={m.basemap_style_info()} />
  </span>
  <RadioButtonGroup
    legendText=""
    hideLabel
    selected={selectedStyle}
    on:change={(e) => handleStyleChange(e.detail as BasemapStyle)}
  >
    {#each tiledBasemapOptions as option (option.value)}
      <RadioButton labelText={option.label} value={option.value} />
    {/each}
  </RadioButtonGroup>
  <div class="labels-toggle">
    <Toggle
      size="sm"
      labelText={m.basemap_show_labels()}
      toggled={basemapStyleStore.showLabels}
      on:toggle={handleLabelsToggle}
    />
  </div>
</div>

<style>
  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    font-weight: var(--cds-label-01-font-weight, 400);
    line-height: var(--cds-label-01-line-height, 1.33333);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-02);
  }

  .basemap-style-selector :global(.cds--radio-button-group) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .labels-toggle {
    margin-top: var(--cds-spacing-04);
  }
</style>
