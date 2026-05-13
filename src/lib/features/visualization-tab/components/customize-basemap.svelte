<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PaintBrush } from 'carbon-icons-svelte';
  import MainToolBarHeader from '$lib/features/main-toolbar/components/main-toolbar-header.svelte';

  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { InfoPopover } from './shared';
  import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
  import LayerConfigTerre from './basemap-layers/layer-config-terre.svelte';
  import LayerConfigSimple from './basemap-layers/layer-config-simple.svelte';
  import LayerConfigRelief from './basemap-layers/layer-config-relief.svelte';
  import LayerConfigMeridiens from './basemap-layers/layer-config-meridiens.svelte';
  import LayerConfigVilles from './basemap-layers/layer-config-villes.svelte';
  import BasemapStyleSelector from './basemap-layers/basemap-style-selector.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import {
    basemapService,
    getPreferredBasemapFile
  } from '$lib/features/map/services/basemap.service.svelte';
  import {
    basemapLayersStore,
    type BasemapLayerConfig,
    type BasemapLayerId
  } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import { resolveTiledStyleFromToggle } from '../services/tiled-basemap-selection.service';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import { resolveActiveBasemapMetadata } from '$lib/features/map/utils/basemap-metadata-resolution.utils';

  const layerConfigs = $derived(
    new Map(basemapLayersStore.layers.map((l) => [l.id, l] as const))
  );

  function getConfig<T extends BasemapLayerId>(
    id: T
  ): Extract<BasemapLayerConfig, { id: T }> | undefined {
    return layerConfigs.get(id) as
      | Extract<BasemapLayerConfig, { id: T }>
      | undefined;
  }

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
  const availableMetadataLayerTypes = $derived.by(
    () =>
      new Set(
        (currentMetadata?.layers ?? []).map(
          (layer: { type: BasemapLayerType }) => layer.type
        )
      )
  );
  const supportsCatalogGeometry = $derived(Boolean(currentMetadata));
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
  const supportsFrontieresDotted = $derived(
    !availableMetadataLayerTypes.has(BasemapLayerType.LIMIT)
  );
  const hiddenCustomLayerIds = $derived.by(() => {
    if (!isCustomBasemap) {
      return [] as BasemapLayerId[];
    }

    const hidden: BasemapLayerId[] = [
      'mers',
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

  $effect(() => {
    for (const layerId of hiddenCustomLayerIds) {
      if (getConfig(layerId)?.visible ?? false) {
        basemapLayersStore.setLayerVisibility(layerId, false);
      }
    }

    if (
      !supportsLakesRivers &&
      ((getConfig('lacs')?.visible ?? false) ||
        (getConfig('rivieres')?.visible ?? false))
    ) {
      basemapLayersStore.setLayerVisibility('lacs', false);
      basemapLayersStore.setLayerVisibility('rivieres', false);
    }

    if (!supportsCities && (getConfig('villes')?.visible ?? false)) {
      basemapLayersStore.setLayerVisibility('villes', false);
    }
  });

  function handleLacsRivieresToggle(checked: boolean): void {
    basemapLayersStore.setLayerVisibility('lacs', checked);
    basemapLayersStore.setLayerVisibility('rivieres', checked);
  }

  function handleLacsRivieresChange(updates: Record<string, unknown>): void {
    const shared: { color?: string; opacity?: number } = {};
    if (typeof updates.color === 'string') shared.color = updates.color;
    if (typeof updates.opacity === 'number') shared.opacity = updates.opacity;
    if (shared.color !== undefined || shared.opacity !== undefined) {
      basemapLayersStore.updateLayer('lacs', shared);
      basemapLayersStore.updateLayer('rivieres', shared);
    }
    if (typeof updates.thickness === 'number') {
      basemapLayersStore.updateLayer('rivieres', {
        thickness: updates.thickness
      });
    }
  }

  function handleLayerToggle(layerId: BasemapLayerId, checked: boolean) {
    basemapLayersStore.setLayerVisibility(layerId, checked);
  }

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

  function handleLayerChange<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Extract<BasemapLayerConfig, { id: T }>>
  ): void {
    basemapLayersStore.updateLayer(id, updates);
  }
</script>

<section id="customize-basemap">
  <MainToolBarHeader title={m.step3_title()} icon={PaintBrush} showDivider />

  {#if !isTiledBasemapEnabled}
    <div class="content-area">
      <p class="kh-help">{m.step3_description()}</p>
    </div>
  {/if}

  <div class="layers-list">
    {#if !isTiledBasemapEnabled}
      {#if isCustomBasemap}
        {#if !isCustomLineBasemap}
          <ExpandableSection
            title={m.basemap_config_fill()}
            showToggle={true}
            toggleVariant="suggestions"
            toggleChecked={getConfig('terre')?.visible ?? true}
            onToggleChange={(checked) => handleLayerToggle('terre', checked)}
          >
            <LayerConfigTerre
              showStrokeSection={false}
              fillColor={getConfig('terre')?.fillColor}
              fillShadow={getConfig('terre')?.fillShadow}
              fillOpacity={getConfig('terre')?.fillOpacity}
              strokeColor={getConfig('terre')?.strokeColor}
              strokeDotted={getConfig('terre')?.strokeDotted}
              strokeDottedPattern={getConfig('terre')?.strokeDottedPattern}
              strokeThickness={getConfig('terre')?.strokeThickness}
              strokeOpacity={getConfig('terre')?.strokeOpacity}
              onchange={(updates) => handleLayerChange('terre', updates)}
            />
          </ExpandableSection>
        {/if}

        <ExpandableSection
          title={m.basemap_config_stroke()}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('frontieres')?.visible ?? true}
          onToggleChange={(checked) => handleLayerToggle('frontieres', checked)}
        >
          <LayerConfigSimple
            showColor={true}
            showDotted={true}
            showThickness={true}
            color={getConfig('frontieres')?.color}
            dotted={getConfig('frontieres')?.dotted}
            dottedPattern={getConfig('frontieres')?.dottedPattern}
            thickness={getConfig('frontieres')?.thickness}
            opacity={getConfig('frontieres')?.opacity}
            onchange={(updates) => handleLayerChange('frontieres', updates)}
          />
        </ExpandableSection>
      {:else}
        <ExpandableSection
          title={m.basemap_layer_terre()}
          description={!supportsCatalogGeometry
            ? m.basemap_layer_unavailable()
            : undefined}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={supportsCatalogGeometry &&
            (getConfig('terre')?.visible ?? true)}
          toggleDisabled={!supportsCatalogGeometry}
          disabled={!supportsCatalogGeometry}
          disabledReason={!supportsCatalogGeometry
            ? m.basemap_layer_unavailable_reason()
            : undefined}
          onToggleChange={(checked) => handleLayerToggle('terre', checked)}
        >
          <LayerConfigTerre
            fillColor={getConfig('terre')?.fillColor}
            fillShadow={getConfig('terre')?.fillShadow}
            fillOpacity={getConfig('terre')?.fillOpacity}
            strokeColor={getConfig('terre')?.strokeColor}
            strokeDotted={getConfig('terre')?.strokeDotted}
            strokeDottedPattern={getConfig('terre')?.strokeDottedPattern}
            strokeThickness={getConfig('terre')?.strokeThickness}
            strokeOpacity={getConfig('terre')?.strokeOpacity}
            onchange={(updates) => handleLayerChange('terre', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_mers()}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('mers')?.visible ?? true}
          onToggleChange={(checked) => handleLayerToggle('mers', checked)}
        >
          <LayerConfigSimple
            showColor={true}
            showDotted={false}
            showThickness={false}
            color={getConfig('mers')?.color}
            opacity={getConfig('mers')?.opacity}
            onchange={(updates) => handleLayerChange('mers', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_lacs_rivieres()}
          description={!supportsLakesRivers
            ? m.basemap_layer_unavailable()
            : undefined}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('lacs')?.visible ?? false}
          toggleDisabled={!supportsLakesRivers}
          disabled={!supportsLakesRivers}
          disabledReason={!supportsLakesRivers
            ? m.basemap_layer_unavailable_reason()
            : undefined}
          onToggleChange={handleLacsRivieresToggle}
        >
          <LayerConfigSimple
            showColor={true}
            showDotted={false}
            showThickness={true}
            thicknessLabel={m.basemap_config_thickness_rivers()}
            color={getConfig('lacs')?.color}
            thickness={getConfig('rivieres')?.thickness}
            opacity={getConfig('lacs')?.opacity}
            onchange={handleLacsRivieresChange}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_relief()}
          description={!supportsCatalogGeometry
            ? m.basemap_layer_unavailable()
            : undefined}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={supportsCatalogGeometry &&
            (getConfig('relief')?.visible ?? true)}
          toggleDisabled={!supportsCatalogGeometry}
          disabled={!supportsCatalogGeometry}
          disabledReason={!supportsCatalogGeometry
            ? m.basemap_layer_unavailable_reason()
            : undefined}
          onToggleChange={(checked) => handleLayerToggle('relief', checked)}
        >
          <LayerConfigRelief
            representation={getConfig('relief')?.representation}
            color={getConfig('relief')?.color}
            opacity={getConfig('relief')?.opacity}
            onchange={(updates) => handleLayerChange('relief', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_equateur()}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('equateur')?.visible ?? true}
          onToggleChange={(checked) => handleLayerToggle('equateur', checked)}
        >
          <LayerConfigSimple
            showColor={true}
            showDotted={true}
            showThickness={true}
            color={getConfig('equateur')?.color}
            dotted={getConfig('equateur')?.dotted}
            dottedPattern={getConfig('equateur')?.dottedPattern}
            thickness={getConfig('equateur')?.thickness}
            opacity={getConfig('equateur')?.opacity}
            onchange={(updates) => handleLayerChange('equateur', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_meridiens()}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('meridiens')?.visible ?? true}
          onToggleChange={(checked) => handleLayerToggle('meridiens', checked)}
        >
          <LayerConfigMeridiens
            mode={getConfig('meridiens')?.mode}
            spacingDegrees={getConfig('meridiens')?.spacingDegrees}
            color={getConfig('meridiens')?.color}
            dotted={getConfig('meridiens')?.dotted}
            dottedPattern={getConfig('meridiens')?.dottedPattern}
            thickness={getConfig('meridiens')?.thickness}
            opacity={getConfig('meridiens')?.opacity}
            onchange={(updates) => handleLayerChange('meridiens', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_frontieres()}
          description={!supportsCatalogGeometry
            ? m.basemap_layer_unavailable()
            : undefined}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={supportsCatalogGeometry &&
            (getConfig('frontieres')?.visible ?? true)}
          toggleDisabled={!supportsCatalogGeometry}
          disabled={!supportsCatalogGeometry}
          disabledReason={!supportsCatalogGeometry
            ? m.basemap_layer_unavailable_reason()
            : undefined}
          onToggleChange={(checked) => handleLayerToggle('frontieres', checked)}
        >
          <LayerConfigSimple
            showColor={true}
            showDotted={true}
            disableDotted={!supportsCatalogGeometry ||
              !supportsFrontieresDotted}
            dottedDisabledReason={!supportsCatalogGeometry
              ? m.basemap_layer_unavailable_reason()
              : !supportsFrontieresDotted
                ? m.basemap_dotted_unavailable_reason()
                : undefined}
            showThickness={true}
            color={getConfig('frontieres')?.color}
            dotted={getConfig('frontieres')?.dotted}
            dottedPattern={getConfig('frontieres')?.dottedPattern}
            thickness={getConfig('frontieres')?.thickness}
            opacity={getConfig('frontieres')?.opacity}
            onchange={(updates) => handleLayerChange('frontieres', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_villes()}
          description={!supportsCities
            ? m.basemap_layer_unavailable()
            : undefined}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={supportsCities &&
            (getConfig('villes')?.visible ?? true)}
          toggleDisabled={!supportsCities}
          disabled={!supportsCities}
          disabledReason={!supportsCities
            ? m.basemap_layer_unavailable_reason()
            : undefined}
          onToggleChange={(checked) => handleLayerToggle('villes', checked)}
        >
          <LayerConfigVilles
            count={getConfig('villes')?.count}
            symbol={getConfig('villes')?.symbol}
            color={getConfig('villes')?.color}
            size={getConfig('villes')?.size}
            opacity={getConfig('villes')?.opacity}
            labelFontFamily={getConfig('villes')?.labelFontFamily}
            labelSize={getConfig('villes')?.labelSize}
            labelColor={getConfig('villes')?.labelColor}
            onchange={(updates) => handleLayerChange('villes', updates)}
          />
        </ExpandableSection>
      {/if}
    {/if}

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
      <div class="reference-basemap-tool">
        <p class="kh-help">{m.basemap_tiled_helper()}</p>
        <BasemapStyleSelector />
      </div>
    </ExpandableSection>
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
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .reference-basemap-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    background-color: var(--cds-layer-01);
  }
</style>
