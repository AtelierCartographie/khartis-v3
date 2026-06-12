<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PaintBrush } from 'carbon-icons-svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import MainToolBarHeader from '$lib/features/main-toolbar/components/main-toolbar-header.svelte';

  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { VisualizationTools } from '$lib/features/commons/types/global';
  import { selectTool } from '$lib/features/step-toolbar/tools-list/tool-list.utils.svelte';
  import { InfoPopover } from './shared';
  import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
  import BasemapStyleSelector from './basemap-layers/basemap-style-selector.svelte';
  import AuxLayerConfigSection from './basemap-layers/aux-layer-config-section.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import {
    basemapService,
    getPreferredBasemapFile
  } from '$lib/features/map/services/basemap.service.svelte';
  import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
  import { SYNTHETIC_AUX_LAYER_KEY } from '$lib/features/commons/constants/basemap.constants';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import { resolveTiledStyleFromToggle } from '../services/tiled-basemap-selection.service';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import { resolveActiveBasemapMetadata } from '$lib/features/map/utils/basemap-metadata-resolution.utils';
  import { getBasemapAuxLayerDefaultVisibility } from '$lib/features/map/utils/basemap-aux-layer-visibility.utils';
  import type { BasemapLayer } from '$lib/features/map/types/basemap.types';
  import type { BasemapLayerId } from '$lib/features/map/stores/basemap-layers.store.svelte';

  const isTiledBasemapEnabled = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );

  function getActiveReferenceBasemapMetadata(
    referenceBasemapId: string | null
  ) {
    if (!referenceBasemapId) {
      return null;
    }

    const resolvedBasemapId = getPreferredBasemapFile(
      basemapService.availableBasemaps,
      referenceBasemapId
    );

    return resolveActiveBasemapMetadata({
      referenceBasemapId,
      resolvedBasemapId,
      availableBasemaps: basemapService.availableBasemaps,
      currentMetadata: basemapService.currentMetadata
    });
  }

  const currentMetadata = $derived.by(() =>
    getActiveReferenceBasemapMetadata(basemapStyleStore.referenceBasemapId)
  );

  const customBaseLayerType = $derived.by(
    () =>
      currentMetadata?.layers.find(
        (layer) =>
          layer.type === BasemapLayerType.POLYGON ||
          layer.type === BasemapLayerType.LINE ||
          layer.type === BasemapLayerType.POINT
      )?.type
  );
  const isCustomBasemap = $derived(Boolean(currentMetadata?.isCustom));
  const isCustomLineBasemap = $derived(
    isCustomBasemap && customBaseLayerType === BasemapLayerType.LINE
  );

  function mapLayerTypeToLegacyId(
    type: BasemapLayerType,
    isCustom: boolean,
    isCustomLine: boolean
  ): BasemapLayerId | null {
    switch (type) {
      case BasemapLayerType.LAND:
        return isCustomLine ? null : 'terre';
      case BasemapLayerType.LIMIT:
        return 'frontieres';
      case BasemapLayerType.CENTROID:
      case BasemapLayerType.POINT:
        return isCustom ? null : 'villes';
      case BasemapLayerType.GRATICULE:
        return 'meridiens';
      case BasemapLayerType.GEOGRAPHIC_LINES:
        return 'equateur';
      case BasemapLayerType.POLYGON:
        // For custom basemaps the polygon is the main territory geometry,
        // expose the full Terre fill+stroke controls. Catalog basemaps use
        // POLYGON for hydrography/relief, mapped to Mers.
        return isCustom ? 'terre' : 'mers';
      case BasemapLayerType.LINE:
        // Custom line basemaps use the Frontières controls (line color +
        // dotted + thickness) since the imported geometry is a network of
        // segments, closer to boundaries than to rivers.
        return isCustom ? 'frontieres' : 'rivieres';
      case BasemapLayerType.SPHERE:
        return 'sphere';
      default:
        return null;
    }
  }

  const sphereSyntheticLayer: BasemapLayer = {
    title_fr: m.basemap_layer_sphere({}, { locale: 'fr' }),
    title_en: m.basemap_layer_sphere({}, { locale: 'en' }),
    type: BasemapLayerType.SPHERE,
    file: SYNTHETIC_AUX_LAYER_KEY.SPHERE,
    style: null
  };
  const oceanSyntheticLayer: BasemapLayer = {
    title_fr: m.basemap_layer_mers({}, { locale: 'fr' }),
    title_en: m.basemap_layer_mers({}, { locale: 'en' }),
    type: BasemapLayerType.POLYGON,
    file: SYNTHETIC_AUX_LAYER_KEY.MERS,
    style: null
  };

  interface LayerEntry {
    layer: BasemapLayer;
    sharedLegacyId: BasemapLayerId | null;
    instanceIndex: number;
    defaultVisible: boolean;
  }

  function isSection3RenderableType(type: BasemapLayerType): boolean {
    // Centroids feed the Symboles / Textes primitives, not the basemap personalization.
    // Geographic lines (equator, tropics, polar circles, Greenwich) are merged into the
    // Graticules section through its "Remarquable" sub-toggle.
    if (type === BasemapLayerType.CENTROID) return false;
    if (type === BasemapLayerType.GEOGRAPHIC_LINES) return false;
    return true;
  }

  // The projection sphere is the outline of a global d3 projection. Composite
  // projections (e.g. EUROPE_DOM_TOM / FRANCE_DOM_TOM) and already-projected
  // ("identity") basemaps have no single sphere, so `parseSphere` yields nothing
  // and the toggle is a visual no-op. Only expose the control for `simple`
  // projections where it actually renders.
  const supportsProjectionSphere = $derived(
    currentMetadata?.proj_to?.type === 'simple'
  );

  const layerEntries = $derived.by<LayerEntry[]>(() => {
    const metadata = currentMetadata;
    if (!metadata) return [];
    const typeCounters = new SvelteMap<BasemapLayerType, number>();
    const entries: LayerEntry[] = [
      {
        layer: oceanSyntheticLayer,
        sharedLegacyId: 'mers',
        instanceIndex: 0,
        defaultVisible: true
      },
      ...(supportsProjectionSphere
        ? [
            {
              layer: sphereSyntheticLayer,
              sharedLegacyId: 'sphere' as BasemapLayerId,
              instanceIndex: 0,
              defaultVisible: true
            }
          ]
        : [])
    ];
    typeCounters.set(BasemapLayerType.POLYGON, 1);
    typeCounters.set(BasemapLayerType.SPHERE, 1);
    for (const layer of metadata.layers) {
      if (!isSection3RenderableType(layer.type)) continue;
      const count = typeCounters.get(layer.type) ?? 0;
      typeCounters.set(layer.type, count + 1);
      entries.push({
        layer,
        sharedLegacyId: mapLayerTypeToLegacyId(
          layer.type,
          isCustomBasemap,
          isCustomLineBasemap
        ),
        instanceIndex: count,
        defaultVisible: getBasemapAuxLayerDefaultVisibility(
          layer,
          metadata.layers
        )
      });
    }
    return entries;
  });

  const availableMetadataLayerTypes = $derived.by(
    () =>
      new Set(
        (currentMetadata?.layers ?? []).map(
          (layer: { type: BasemapLayerType }) => layer.type
        )
      )
  );
  const hiddenCustomLayerIds = $derived.by<BasemapLayerId[]>(() => {
    if (!isCustomBasemap) {
      return [];
    }
    const hidden: BasemapLayerId[] = [
      'lacs',
      'rivieres',
      'relief',
      'equateur',
      'meridiens',
      'villes'
    ];
    if (isCustomLineBasemap) {
      hidden.push('terre');
    }
    return hidden;
  });
  const supportsLakesRivers = $derived(
    !isCustomBasemap &&
      (availableMetadataLayerTypes.has(BasemapLayerType.POLYGON) ||
        availableMetadataLayerTypes.has(BasemapLayerType.LINE))
  );
  const supportsCities = $derived(
    !isCustomBasemap &&
      (availableMetadataLayerTypes.has(BasemapLayerType.CENTROID) ||
        availableMetadataLayerTypes.has(BasemapLayerType.POINT))
  );
  const supportsRemarkableGraticule = $derived(
    availableMetadataLayerTypes.has(BasemapLayerType.GEOGRAPHIC_LINES)
  );

  function getLayerVisibility(layerId: BasemapLayerId): boolean {
    return (
      basemapLayersStore.layers.find((layer) => layer.id === layerId)
        ?.visible ?? false
    );
  }

  $effect(() => {
    for (const layerId of hiddenCustomLayerIds) {
      if (getLayerVisibility(layerId)) {
        basemapLayersStore.setLayerVisibility(layerId, false);
      }
    }

    if (
      !supportsLakesRivers &&
      (getLayerVisibility('lacs') || getLayerVisibility('rivieres'))
    ) {
      basemapLayersStore.setLayerVisibility('lacs', false);
      basemapLayersStore.setLayerVisibility('rivieres', false);
    }

    if (!supportsCities && getLayerVisibility('villes')) {
      basemapLayersStore.setLayerVisibility('villes', false);
    }
  });

  function handleTiledBasemapToggle(checked: boolean) {
    const isFirstActivation =
      checked && basemapStyleStore.selectedStyle === BasemapStyle.BLANK_WHITE;
    const preferredStyle = isFirstActivation
      ? BasemapStyle.MONDE_COULEURS
      : (basemapStyleStore.lastSelectedTiledStyle ??
        BasemapStyle.MONDE_COULEURS);
    const nextStyle = resolveTiledStyleFromToggle(
      checked,
      basemapStyleStore.selectedStyle,
      preferredStyle
    );

    if (!checked) {
      mapInstanceStore.clearPersistedViewState();
    }

    if (checked && mapProjectionStore.isGlobe) {
      mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR);
    }

    if (osmBasemapStore.isActive) {
      osmBasemapStore.clear();
    }

    if (nextStyle === basemapStyleStore.selectedStyle) {
      if (checked) {
        basemapStyleStore.requestViewportReset(nextStyle);
      }
      return;
    }

    basemapStyleStore.setStyle(nextStyle);

    if (checked) {
      basemapStyleStore.requestViewportReset(nextStyle);
    }
  }
</script>

{#snippet referenceBasemapSettings()}
  <div class="reference-basemap-tool">
    <p class="kh-help">{m.basemap_tiled_helper()}</p>
    <BasemapStyleSelector />
    <Button
      kind="ghost"
      size="small"
      class="projection-shortcut-btn"
      on:click={() => selectTool(VisualizationTools.Projection)}
    >
      {m.basemap_projection_shortcut()}
    </Button>
  </div>
{/snippet}

<section id="customize-basemap">
  <MainToolBarHeader title={m.step3_title()} icon={PaintBrush} showDivider />

  {#if !isTiledBasemapEnabled && !currentMetadata}
    <div class="content-area">
      <p class="kh-help">{m.step3_description()}</p>
    </div>
  {/if}

  <div
    class="layers-list"
    class:has-bottom-border={isTiledBasemapEnabled || Boolean(currentMetadata)}
  >
    {#if !isTiledBasemapEnabled && currentMetadata}
      {#each layerEntries as entry (entry.layer.file ?? `${currentMetadata.file}:${entry.layer.type}:${entry.instanceIndex}`)}
        <AuxLayerConfigSection
          layer={entry.layer}
          basemapFile={currentMetadata.file}
          sharedLegacyId={entry.sharedLegacyId ?? undefined}
          instanceIndex={entry.instanceIndex}
          defaultVisible={entry.defaultVisible}
          allowRemarkable={supportsRemarkableGraticule}
        />
      {/each}
    {/if}

    {#if !currentMetadata || isTiledBasemapEnabled}
      {#if isTiledBasemapEnabled && !currentMetadata}
        <div class="reference-basemap-bare">
          {@render referenceBasemapSettings()}
        </div>
      {:else}
        <ExpandableSection
          title={m.basemap_tiled_label()}
          defaultOpen={isTiledBasemapEnabled}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={isTiledBasemapEnabled}
          onToggleChange={handleTiledBasemapToggle}
        >
          {#snippet icon()}
            <InfoPopover text={m.basemap_tiled_info()} />
          {/snippet}
          {@render referenceBasemapSettings()}
        </ExpandableSection>
      {/if}
    {/if}
  </div>
</section>

<style lang="scss">
  #customize-basemap {
    display: flex;
    flex-direction: column;
    padding: 16px 0;
  }

  .content-area {
    padding: 16px 16px 8px 16px;
  }

  .kh-help {
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    margin: 0;
  }

  .layers-list {
    --khartis-expandable-section-body-padding: 8px 48px 24px 16px;
    display: flex;
    flex-direction: column;
  }

  .layers-list.has-bottom-border {
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .reference-basemap-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    background-color: var(--cds-layer-01);
  }

  .reference-basemap-bare {
    padding: 16px 48px 24px 16px;
  }

  .layers-list :global(.projection-shortcut-btn) {
    align-self: flex-start;
    padding-left: 0;
  }
</style>
