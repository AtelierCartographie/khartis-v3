<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PaintBrush } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { InfoPopover } from './components/shared';
  import LayerConfigTerre from './components/basemap-layers/layer-config-terre.svelte';
  import LayerConfigSimple from './components/basemap-layers/layer-config-simple.svelte';
  import LayerConfigRelief from './components/basemap-layers/layer-config-relief.svelte';
  import LayerConfigMeridiens from './components/basemap-layers/layer-config-meridiens.svelte';
  import LayerConfigVilles from './components/basemap-layers/layer-config-villes.svelte';
  import BasemapStyleSelector from './basemap-style-selector.svelte';
  import MapProjectionSelector from './map-projection-selector.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import {
    basemapLayersStore,
    type BasemapLayerConfig,
    type BasemapLayerId
  } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { resolveTiledStyleFromToggle } from './tiled-basemap-selection';

  // Single $derived: one array iteration instead of 9 separate .find() calls
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
    basemapStyleStore.requiresMapLibre || osmBasemapStore.isActive
  );
  const currentMetadata = $derived(basemapService.currentMetadata);
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
  const supportsLakesRivers = $derived(
    !isCustomBasemap &&
      (availableMetadataLayerTypes.has(BasemapLayerType.POLYGON) ||
        availableMetadataLayerTypes.has(BasemapLayerType.LINE))
  );
  const supportsCities = $derived(
    !isCustomBasemap && availableMetadataLayerTypes.has(BasemapLayerType.POINT)
  );
  const supportsEquatorDotted = $derived(
    !availableMetadataLayerTypes.has(BasemapLayerType.GEOGRAPHIC_LINES)
  );
  const supportsMeridiansDotted = $derived(
    !availableMetadataLayerTypes.has(BasemapLayerType.GRATICULE)
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
    const nextStyle = resolveTiledStyleFromToggle(
      checked,
      basemapStyleStore.selectedStyle,
      basemapStyleStore.preferredTiledStyle
    );

    if (!checked) {
      mapInstanceStore.clearPersistedViewState();
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

  <div class="content-area">
    <p class="kh-help">{m.step3_description()}</p>
  </div>

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
            thicknessMax={20}
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
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('terre')?.visible ?? true}
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
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('relief')?.visible ?? true}
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
            disableDotted={!supportsEquatorDotted}
            dottedDisabledReason={!supportsEquatorDotted
              ? m.basemap_dotted_unavailable_reason()
              : undefined}
            showThickness={true}
            thicknessMax={20}
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
            remarquables={getConfig('meridiens')?.remarquables}
            color={getConfig('meridiens')?.color}
            dotted={getConfig('meridiens')?.dotted}
            dottedPattern={getConfig('meridiens')?.dottedPattern}
            disableDotted={!supportsMeridiansDotted}
            dottedDisabledReason={!supportsMeridiansDotted
              ? m.basemap_dotted_unavailable_reason()
              : undefined}
            thickness={getConfig('meridiens')?.thickness}
            opacity={getConfig('meridiens')?.opacity}
            onchange={(updates) => handleLayerChange('meridiens', updates)}
          />
        </ExpandableSection>

        <ExpandableSection
          title={m.basemap_layer_frontieres()}
          showToggle={true}
          toggleVariant="suggestions"
          toggleChecked={getConfig('frontieres')?.visible ?? true}
          onToggleChange={(checked) => handleLayerToggle('frontieres', checked)}
        >
          <LayerConfigSimple
            showColor={true}
            showDotted={true}
            disableDotted={!supportsFrontieresDotted}
            dottedDisabledReason={!supportsFrontieresDotted
              ? m.basemap_dotted_unavailable_reason()
              : undefined}
            showThickness={true}
            thicknessMax={20}
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
          toggleChecked={getConfig('villes')?.visible ?? true}
          toggleDisabled={!supportsCities}
          disabled={!supportsCities}
          disabledReason={!supportsCities
            ? m.basemap_layer_unavailable_reason()
            : undefined}
          onToggleChange={(checked) => handleLayerToggle('villes', checked)}
        >
          <LayerConfigVilles
            category={getConfig('villes')?.category}
            symbol={getConfig('villes')?.symbol}
            color={getConfig('villes')?.color}
            size={getConfig('villes')?.size}
            opacity={getConfig('villes')?.opacity}
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
      <div class="tiled-basemap-config">
        <BasemapStyleSelector />
        <MapProjectionSelector />
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

  .tiled-basemap-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    background-color: var(--cds-layer-01);
  }
</style>
