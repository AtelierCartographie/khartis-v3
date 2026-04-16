<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { InfoPopover, ToggleWithLabel } from './components/shared';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    ZONES,
    getStylesForZone,
    getToggleableGroups,
    getStyleConfig,
    type ZoneId,
    type StyleVariantId,
    type LayerGroupId
  } from '$lib/features/map/constants/carte-facile-layer-groups';
  import {
    resolveNextTiledStyleSelection,
    resolveTiledStyleContext
  } from './tiled-basemap-selection';

  const currentStyleContext = $derived(
    resolveTiledStyleContext(
      basemapStyleStore.selectedStyle,
      basemapStyleStore.preferredTiledStyle
    )
  );

  const currentConfig = $derived(getStyleConfig(currentStyleContext));

  const selectedZone = $derived<ZoneId>(currentConfig?.zone ?? 'monde');

  const selectedVariant = $derived<StyleVariantId>(
    currentConfig?.style ?? 'niveaux-de-gris'
  );

  const stylesForZone = $derived(getStylesForZone(selectedZone));
  const selectedStyleId = $derived(basemapStyleStore.selectedStyle);

  const toggleableGroups = $derived(
    currentConfig ? getToggleableGroups(currentConfig) : []
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
    const stylesInNewZone = getStylesForZone(zone);
    const sameVariant = stylesInNewZone.find(
      (s) => s.style === selectedVariant
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

  function handleGroupToggle(groupId: LayerGroupId, toggled: boolean): void {
    basemapStyleStore.setGroupVisibility(groupId, toggled);
  }

  function getStyleSourceLabel(zone: ZoneId, variant: StyleVariantId): string {
    if (zone === 'france') {
      return 'IGN';
    }

    return variant === 'satellite' ? 'OpenStreetMap + IGN' : 'OpenStreetMap';
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

  <div class="styles-section">
    <div class="style-rail" role="list" aria-label={m.basemap_style_label()}>
      <div class="style-rail-track">
        {#each stylesForZone as styleConfig (styleConfig.id)}
          <button
            type="button"
            class="style-card"
            class:style-card--selected={selectedStyleId === styleConfig.id}
            aria-pressed={selectedStyleId === styleConfig.id}
            onclick={() => handleStyleChange(styleConfig.id)}
          >
            <span
              class={`style-card__preview style-card__preview--${styleConfig.style}`}
              aria-hidden="true"
            >
              <span class="style-card__preview-chip">
                {getStyleSourceLabel(styleConfig.zone, styleConfig.style)}
              </span>
            </span>

            <span class="style-card__content">
              <span class="style-card__title">
                {getVariantLabel(styleConfig.style)}
              </span>
              <span class="style-card__meta">
                {getZoneLabel(styleConfig.zone)}
              </span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Layer group toggles -->
  {#if toggleableGroups.length > 0}
    <div class="groups-section">
      <span class="groups-label">{m.carte_facile_layers_title()}</span>
      <div class="groups-list">
        {#each toggleableGroups as group (group.id)}
          <ToggleWithLabel
            label={getGroupLabel(group.id)}
            toggled={basemapStyleStore.groupVisibility[group.id] ??
              group.defaultVisible}
            showYesNo={false}
            ontoggle={(checked) => handleGroupToggle(group.id, checked)}
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

  .styles-section {
    display: flex;
    flex-direction: column;
  }

  .style-rail {
    margin-left: calc(-1 * var(--cds-spacing-04));
    margin-right: calc(-1 * var(--cds-spacing-04));
    padding-left: var(--cds-spacing-04);
    padding-right: var(--cds-spacing-04);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-subtle) transparent;
    scroll-snap-type: x proximity;
  }

  .style-rail::-webkit-scrollbar {
    height: 6px;
  }

  .style-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .style-rail::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-subtle);
  }

  .style-rail-track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(168px, 168px);
    gap: var(--cds-spacing-03);
    width: max-content;
    padding-bottom: var(--cds-spacing-03);
  }

  .style-card {
    appearance: none;
    border: 1px solid var(--cds-border-subtle);
    background: var(--cds-layer-01);
    color: inherit;
    text-align: left;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    min-height: 144px;
    overflow: hidden;
    scroll-snap-align: start;
    transition:
      border-color 120ms ease,
      background-color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .style-card:hover {
    background: var(--cds-layer-hover-01);
    transform: translateY(-1px);
  }

  .style-card:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .style-card--selected {
    border-color: var(--cds-interactive);
    box-shadow: inset 0 0 0 1px var(--cds-interactive);
    background: var(--cds-layer-selected);
  }

  .style-card__preview {
    position: relative;
    display: block;
    min-height: 92px;
    overflow: hidden;
    background-color: #d9e8f6;
  }

  .style-card__preview::before,
  .style-card__preview::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .style-card__preview::after {
    background:
      linear-gradient(
        120deg,
        transparent 0 28%,
        rgba(255, 255, 255, 0.65) 28% 30%,
        transparent 30% 100%
      ),
      linear-gradient(
        0deg,
        transparent 0 72%,
        rgba(255, 255, 255, 0.22) 72% 74%,
        transparent 74% 100%
      );
    mix-blend-mode: screen;
  }

  .style-card__preview--couleurs {
    background:
      radial-gradient(circle at 22% 66%, #c8dd8c 0 12%, transparent 13%),
      radial-gradient(circle at 72% 34%, #9bc47a 0 11%, transparent 12%),
      linear-gradient(180deg, #b5d6f4 0 43%, #e8efc5 43% 100%);
  }

  .style-card__preview--couleurs::before {
    background:
      linear-gradient(
        24deg,
        transparent 0 44%,
        rgba(64, 104, 148, 0.45) 44% 46%,
        transparent 46% 100%
      ),
      linear-gradient(
        90deg,
        transparent 0 54%,
        rgba(88, 135, 183, 0.28) 54% 55.5%,
        transparent 55.5% 100%
      );
  }

  .style-card__preview--niveaux-de-gris {
    background:
      radial-gradient(circle at 20% 68%, #d5d5d5 0 12%, transparent 13%),
      radial-gradient(circle at 76% 36%, #bababa 0 10%, transparent 11%),
      linear-gradient(180deg, #dbe2eb 0 42%, #ececec 42% 100%);
  }

  .style-card__preview--niveaux-de-gris::before {
    background:
      linear-gradient(
        24deg,
        transparent 0 44%,
        rgba(82, 82, 82, 0.35) 44% 46%,
        transparent 46% 100%
      ),
      linear-gradient(
        90deg,
        transparent 0 54%,
        rgba(109, 109, 109, 0.22) 54% 55.5%,
        transparent 55.5% 100%
      );
  }

  .style-card__preview--satellite {
    background:
      radial-gradient(circle at 18% 74%, #3e6b2e 0 13%, transparent 14%),
      radial-gradient(circle at 76% 35%, #719b4b 0 11%, transparent 12%),
      linear-gradient(135deg, #163e62 0 34%, #496f35 34% 68%, #8b6d42 68% 100%);
  }

  .style-card__preview--satellite::before {
    background:
      radial-gradient(
        circle at 26% 38%,
        rgba(255, 255, 255, 0.18) 0 7%,
        transparent 8%
      ),
      linear-gradient(
        15deg,
        transparent 0 51%,
        rgba(255, 255, 255, 0.18) 51% 53%,
        transparent 53% 100%
      );
    mix-blend-mode: lighten;
  }

  .style-card__preview-chip {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(4px);
    border-radius: 999px;
  }

  .style-card__content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
  }

  .style-card__title {
    font-size: 0.875rem;
    line-height: 1.125rem;
    font-weight: 600;
    color: var(--cds-text-primary);
  }

  .style-card__meta {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--cds-text-secondary);
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
    gap: var(--cds-spacing-02);
  }
</style>
