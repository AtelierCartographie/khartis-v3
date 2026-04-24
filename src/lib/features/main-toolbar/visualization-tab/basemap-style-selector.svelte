<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { InlineLoading, Link } from 'carbon-components-svelte';
  import { Earth, Launch, MapBoundary } from 'carbon-icons-svelte';
  import SimpleCheckbox from '$lib/features/commons/components/simple-checkbox.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { BasemapCardVertical } from '$lib/features/main-toolbar/data-tab/components';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import { mapLoadingStore } from '$lib/features/map/stores/map-loading.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import {
    ZONES,
    getStylesForZone,
    getStyleConfig,
    getToggleableGroups,
    type ZoneId,
    type StyleVariantId,
    type LayerGroupId,
    type StyleConfig
  } from '$lib/features/map/constants/carte-facile-layer-groups';
  import {
    resolveNextTiledStyleSelection,
    resolveTiledStyleContext
  } from './tiled-basemap-selection';

  type ReferenceLayerId =
    | 'hydro'
    | 'landcover'
    | 'buildings'
    | 'streets'
    | 'boundaries'
    | 'labels'
    | 'admin-boundaries'
    | 'cadastre';

  interface ReferenceLayerItem {
    id: ReferenceLayerId;
    groupIds: LayerGroupId[];
    defaultVisible: boolean;
  }

  const REFERENCE_BASEMAP_HELP_URL =
    'https://www.sciencespo.fr/cartographie/khartis/docs';

  const REFERENCE_LAYER_ITEMS: ReferenceLayerItem[] = [
    { id: 'hydro', groupIds: ['hydro'], defaultVisible: true },
    { id: 'landcover', groupIds: ['landcover'], defaultVisible: true },
    { id: 'buildings', groupIds: ['buildings'], defaultVisible: true },
    { id: 'streets', groupIds: ['streets'], defaultVisible: true },
    { id: 'boundaries', groupIds: ['boundaries'], defaultVisible: true },
    { id: 'labels', groupIds: ['labels'], defaultVisible: true },
    {
      id: 'admin-boundaries',
      groupIds: ['admin_boundaries'],
      defaultVisible: false
    },
    { id: 'cadastre', groupIds: ['cadastre'], defaultVisible: false }
  ];

  const currentStyleContext = $derived.by(() => {
    if (
      osmBasemapStore.isActive &&
      basemapStyleStore.selectedStyle === BasemapStyle.BLANK_WHITE &&
      !basemapStyleStore.lastSelectedTiledStyle
    ) {
      return BasemapStyle.MONDE_COULEURS;
    }

    return resolveTiledStyleContext(
      basemapStyleStore.selectedStyle,
      basemapStyleStore.preferredTiledStyle
    );
  });

  const currentConfig = $derived(getStyleConfig(currentStyleContext));
  const currentToggleableGroupIds = $derived.by(() => {
    if (!currentConfig) return new Set<LayerGroupId>();
    return new Set(getToggleableGroups(currentConfig).map((group) => group.id));
  });
  const referenceLayerItems = $derived(
    REFERENCE_LAYER_ITEMS.filter((item) =>
      item.groupIds.every((groupId) => currentToggleableGroupIds.has(groupId))
    )
  );
  const selectedZone = $derived<ZoneId>(currentConfig?.zone ?? 'monde');
  const stylesForZone = $derived(getStylesForZone(selectedZone));
  const isReferenceBasemapLoading = $derived(
    mapLoadingStore.isReferenceBasemapLoading
  );
  const selectedStyleId = $derived(
    basemapStyleStore.selectedStyle === BasemapStyle.BLANK_WHITE
      ? currentStyleContext
      : basemapStyleStore.selectedStyle
  );
  const zoneOptions = $derived(
    ZONES.map((zone) => ({
      id: zone.id,
      label: getZoneLabel(zone.id),
      icon: zone.id === 'monde' ? Earth : MapBoundary
    }))
  );
  const selectedZoneIndex = $derived(
    zoneOptions.findIndex((zone) => zone.id === selectedZone)
  );

  function getZoneLabel(zone: ZoneId): string {
    return zone === 'france'
      ? m.carte_facile_zone_france()
      : m.carte_facile_zone_monde();
  }

  function getVariantLabel(variant: StyleVariantId): string {
    if (variant === 'couleurs') return m.carte_facile_style_couleurs();
    if (variant === 'niveaux-de-gris')
      return m.carte_facile_style_niveaux_de_gris();
    return m.carte_facile_style_satellite();
  }

  function getReferenceLayerLabel(item: ReferenceLayerItem): string {
    switch (item.id) {
      case 'hydro':
        return m.carte_facile_group_hydro();
      case 'landcover':
        return m.carte_facile_group_landcover();
      case 'buildings':
        return m.carte_facile_group_buildings();
      case 'streets':
        return m.carte_facile_group_streets();
      case 'boundaries':
        return m.carte_facile_group_boundaries();
      case 'labels':
        return m.carte_facile_group_labels();
      case 'admin-boundaries':
        return m.carte_facile_group_admin_boundaries();
      case 'cadastre':
        return m.carte_facile_group_cadastre();
    }
  }

  function getStyleCardBasemap(styleConfig: StyleConfig): BasemapMetadata {
    return {
      file: styleConfig.id,
      title_fr: getVariantLabel(styleConfig.style),
      title_en: getVariantLabel(styleConfig.style),
      source: getZoneLabel(styleConfig.zone),
      date: '',
      bbox: [0, 0, 16, 9],
      proj_source: 'EPSG:4326',
      proj_to: { type: 'simple' },
      layers: []
    };
  }

  function activateReferenceBasemap(): void {
    if (osmBasemapStore.isActive) {
      osmBasemapStore.clear();
    }

    if (basemapStyleStore.selectedStyle === BasemapStyle.BLANK_WHITE) {
      basemapStyleStore.setStyle(currentStyleContext);
    }
  }

  function handleZoneChange(zone: ZoneId): void {
    const stylesInNewZone = getStylesForZone(zone);
    const sameVariant = stylesInNewZone.find(
      (s) => s.style === currentConfig?.style
    );
    const newStyle = sameVariant ?? stylesInNewZone[0];
    if (newStyle) {
      const nextStyle = newStyle.id as BasemapStyle;
      if (osmBasemapStore.isActive) {
        osmBasemapStore.clear();
      }
      if (nextStyle === basemapStyleStore.selectedStyle) {
        basemapStyleStore.requestViewportReset(nextStyle);
        return;
      }
      basemapStyleStore.setStyle(nextStyle);
      basemapStyleStore.requestViewportReset(nextStyle);
    }
  }

  function handleStyleChange(styleId: string): void {
    const nextStyle = resolveNextTiledStyleSelection(
      basemapStyleStore.selectedStyle,
      styleId as BasemapStyle,
      osmBasemapStore.isActive
    );
    if (osmBasemapStore.isActive) {
      osmBasemapStore.clear();
    }
    if (nextStyle === basemapStyleStore.selectedStyle) {
      basemapStyleStore.requestViewportReset(nextStyle);
      return;
    }
    if (nextStyle === BasemapStyle.BLANK_WHITE) {
      basemapStyleStore.setStyle(BasemapStyle.BLANK_WHITE);
      return;
    }
    basemapStyleStore.setStyle(nextStyle);
  }

  function isReferenceLayerVisible(item: ReferenceLayerItem): boolean {
    return item.groupIds.every(
      (groupId) =>
        basemapStyleStore.groupVisibility[groupId] ??
        currentConfig?.groups.find((group) => group.id === groupId)
          ?.defaultVisible ??
        item.defaultVisible
    );
  }

  function handleReferenceLayerToggle(item: ReferenceLayerItem): void {
    const nextVisible = !isReferenceLayerVisible(item);

    activateReferenceBasemap();

    for (const groupId of item.groupIds) {
      basemapStyleStore.setGroupVisibility(groupId, nextVisible);
    }
  }

  function handleZoneToggle(index: number): void {
    const zone = zoneOptions[index];
    if (!zone) {
      return;
    }

    handleZoneChange(zone.id);
  }
</script>

<div class="basemap-style-selector">
  {#if isReferenceBasemapLoading}
    <div class="reference-basemap-loading">
      <InlineLoading status="active" description={m.basemap_loading()} />
    </div>
  {/if}

  <div class="scale-selector">
    <span class="field-label">{m.basemap_scale_label()}</span>
    <ToggleTabs
      items={zoneOptions}
      activeIndex={selectedZoneIndex}
      onChange={handleZoneToggle}
      className="scale-toggle-tabs"
      hideInactiveLabel={true}
    />
  </div>

  <div class="styles-section">
    <div class="style-rail" role="list" aria-label={m.basemap_style_label()}>
      <div class="style-rail-track">
        {#each stylesForZone as styleConfig (styleConfig.id)}
          <BasemapCardVertical
            basemap={getStyleCardBasemap(styleConfig)}
            selected={selectedStyleId === styleConfig.id}
            showMatchScore={false}
            showMetadata={false}
            variant="gray"
            onclick={() => handleStyleChange(styleConfig.id)}
          />
        {/each}
      </div>
    </div>
  </div>

  <div class="groups-section">
    <span class="groups-label">{m.carte_facile_layers_title()}</span>
    <div class="groups-list">
      {#each referenceLayerItems as layer (layer.id)}
        <SimpleCheckbox
          labelText={getReferenceLayerLabel(layer)}
          checked={isReferenceLayerVisible(layer)}
          onchange={() => handleReferenceLayerToggle(layer)}
        />
      {/each}
    </div>
    <p class="groups-helper">{m.basemap_tiled_zoom_helper()}</p>
  </div>

  <div class="reference-link">
    <Link
      href={REFERENCE_BASEMAP_HELP_URL}
      target="_blank"
      size="sm"
      icon={Launch}
    >
      {m.basemap_reference_data_learn_more()}
    </Link>
  </div>
</div>

<style lang="scss">
  .basemap-style-selector {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    width: 100%;
  }

  .reference-basemap-loading {
    display: flex;
    align-items: center;
    min-height: 2rem;
  }

  .field-label,
  .groups-label {
    display: block;
    color: var(--cds-text-secondary, #525252);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    font-weight: var(--cds-label-01-font-weight, 400);
    line-height: var(--cds-label-01-line-height, 1rem);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
  }

  .scale-selector {
    position: relative;
  }

  .field-label {
    margin-bottom: var(--cds-spacing-03);
  }

  .scale-selector :global(.scale-toggle-tabs) {
    width: 100%;
  }

  .styles-section {
    display: flex;
    min-width: 0;
  }

  .style-rail {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }

  .style-rail::-webkit-scrollbar {
    display: none;
  }

  .style-rail-track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 184px;
    gap: var(--cds-spacing-03);
    width: max-content;
  }

  .groups-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .groups-list :global(.kh-checkbox-native) {
    align-items: center;
    width: fit-content;
  }

  .groups-helper {
    margin: 0;
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .reference-link :global(.bx--link) {
    width: fit-content;
    color: var(--cds-interactive-03, #726e6e);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .reference-link :global(.bx--link:hover) {
    color: var(--cds-text-primary, #161616);
  }

  .reference-link :global(.bx--link svg) {
    fill: currentColor;
  }
</style>
