<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { RadioButtonGroup, RadioButton, Toggle } from 'carbon-components-svelte';
  import { InfoPopover } from './components/shared';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import {
    ZONES,
    getStylesForZone,
    getToggleableGroups,
    getStyleConfig,
    type ZoneId,
    type StyleVariantId,
    type LayerGroupId
  } from '$lib/features/map/constants/carte-facile-layer-groups';

  // Derive zone and style variant from the currently selected style
  const currentConfig = $derived(getStyleConfig(basemapStyleStore.selectedStyle));

  const selectedZone = $derived<ZoneId>(currentConfig?.zone ?? 'france');

  const selectedVariant = $derived<StyleVariantId>(
    currentConfig?.style ?? 'niveaux-de-gris'
  );

  const stylesForZone = $derived(getStylesForZone(selectedZone));

  const toggleableGroups = $derived(
    currentConfig ? getToggleableGroups(currentConfig) : []
  );

  function getZoneLabel(zone: ZoneId): string {
    return zone === 'france' ? m.carte_facile_zone_france() : m.carte_facile_zone_monde();
  }

  function getVariantLabel(variant: StyleVariantId): string {
    if (variant === 'couleurs') return m.carte_facile_style_couleurs();
    if (variant === 'niveaux-de-gris') return m.carte_facile_style_niveaux_de_gris();
    return m.carte_facile_style_satellite();
  }

  function getGroupLabel(groupId: LayerGroupId): string {
    switch (groupId) {
      case 'landcover':
        return m.carte_facile_group_landcover();
      case 'hydro':
        return m.carte_facile_group_hydro();
      case 'buildings':
        return m.carte_facile_group_buildings();
      case 'streets':
        return m.carte_facile_group_streets();
      case 'boundaries':
        return m.carte_facile_group_boundaries();
      case 'labels':
        return m.carte_facile_group_labels();
      case 'admin_boundaries':
        return m.carte_facile_group_admin_boundaries();
      case 'cadastre':
        return m.carte_facile_group_cadastre();
      default:
        return groupId;
    }
  }

  function handleZoneChange(zone: ZoneId): void {
    // Keep the same style variant when switching zones
    const stylesInNewZone = getStylesForZone(zone);
    const sameVariant = stylesInNewZone.find((s) => s.style === selectedVariant);
    const newStyle = sameVariant ?? stylesInNewZone[0];
    if (newStyle) {
      basemapStyleStore.setStyle(newStyle.id as BasemapStyle);
    }
  }

  function handleStyleChange(styleId: string): void {
    basemapStyleStore.setStyle(styleId as BasemapStyle);
  }

  function handleGroupToggle(
    groupId: LayerGroupId,
    e: CustomEvent<{ toggled: boolean }>
  ): void {
    // Preserve scroll position — Carbon Toggle triggers browser auto-scroll
    // on focus, which can push the toolbar content out of view.
    const scrollable = (e.target as HTMLElement)?.closest('.toolbar-content, .scrollbar-hidden');
    const scrollTop = scrollable?.scrollTop ?? 0;
    basemapStyleStore.setGroupVisibility(groupId, e.detail.toggled);
    if (scrollable) {
      requestAnimationFrame(() => {
        scrollable.scrollTop = scrollTop;
      });
    }
  }


</script>

<div class="basemap-style-selector">
  <span class="field-label">
    {m.basemap_style_label()}
    <InfoPopover text={m.basemap_style_info()} />
  </span>

  <!-- Zone selection -->
  <div class="zone-selector">
    {#each ZONES as zone (zone.id)}
      <button
        class="zone-btn"
        class:zone-btn--active={selectedZone === zone.id}
        onclick={() => handleZoneChange(zone.id)}
      >
        {getZoneLabel(zone.id)}
      </button>
    {/each}
  </div>

  <!-- Style variant selection -->
  <RadioButtonGroup
    legendText=""
    hideLabel
    selected={basemapStyleStore.selectedStyle}
    on:change={(e) => handleStyleChange(e.detail as string)}
  >
    {#each stylesForZone as styleConfig (styleConfig.id)}
      <RadioButton labelText={getVariantLabel(styleConfig.style)} value={styleConfig.id} />
    {/each}
  </RadioButtonGroup>

  <!-- Layer group toggles -->
  {#if toggleableGroups.length > 0}
    <div class="groups-section">
      <span class="groups-label">{m.carte_facile_layers_title()}</span>
      <div class="groups-list">
        {#each toggleableGroups as group (group.id)}
          <Toggle
            size="sm"
            labelText={getGroupLabel(group.id)}
            toggled={basemapStyleStore.groupVisibility[group.id] ?? group.defaultVisible}
            on:toggle={(e) => handleGroupToggle(group.id, e)}
          />
        {/each}
      </div>
    </div>
  {/if}
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

  .zone-selector {
    display: flex;
    gap: var(--cds-spacing-02);
    margin-bottom: var(--cds-spacing-04);
  }

  .zone-btn {
    flex: 1;
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    font-weight: var(--cds-label-01-font-weight, 400);
    cursor: pointer;
    border: 1px solid var(--cds-ui-04);
    background: var(--cds-ui-01);
    color: var(--cds-text-primary);
    transition: background 70ms;
  }

  .zone-btn--active {
    background: var(--cds-ui-04);
    color: var(--cds-text-on-color);
    font-weight: 600;
  }

  .zone-btn:hover:not(.zone-btn--active) {
    background: var(--cds-ui-02);
  }

  .basemap-style-selector :global(.cds--radio-button-group) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .groups-section {
    margin-top: var(--cds-spacing-05);
    border-top: 1px solid var(--cds-ui-03);
    padding-top: var(--cds-spacing-04);
  }

  .groups-label {
    display: block;
    font-size: var(--cds-label-01-font-size, 0.75rem);
    font-weight: var(--cds-label-01-font-weight, 400);
    line-height: var(--cds-label-01-line-height, 1.33333);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-03);
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .groups-list :global(.cds--toggle__label-text) {
    font-size: var(--cds-label-01-font-size, 0.75rem);
  }
</style>
