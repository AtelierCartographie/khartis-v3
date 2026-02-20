<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PaintBrush } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { InfoPopover } from './components/shared';
  import LayerConfigTerre from './components/basemap-layers/LayerConfigTerre.svelte';
  import LayerConfigSimple from './components/basemap-layers/LayerConfigSimple.svelte';
  import LayerConfigRelief from './components/basemap-layers/LayerConfigRelief.svelte';
  import LayerConfigMeridiens from './components/basemap-layers/LayerConfigMeridiens.svelte';
  import LayerConfigVilles from './components/basemap-layers/LayerConfigVilles.svelte';
  import BasemapStyleSelector from './basemap-style-selector.svelte';
  import MapProjectionSelector from './map-projection-selector.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import {
    basemapLayersStore,
    type BasemapLayerConfig,
    type BasemapLayerId
  } from '$lib/features/map/stores/basemap-layers.store.svelte';

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
    basemapStyleStore.selectedStyle !== BasemapStyle.BLANK_WHITE
  );

  // Deck.gl layers are disabled when MapLibre tiled basemap is active
  const areDeckLayersDisabled = $derived(isTiledBasemapEnabled);
  const deckLayersDisabledReason = $derived(
    isTiledBasemapEnabled ? m.basemap_layers_disabled_by_maplibre() : undefined
  );

  function handleLayerToggle(layerId: BasemapLayerId, checked: boolean) {
    logger.info(
      '[customize-basemap] layer visibility toggled',
      LogCategory.UI,
      {
        layerId,
        checked
      }
    );
    basemapLayersStore.setLayerVisibility(layerId, checked);
    projectStore.markAsDirty();
  }

  function handleTiledBasemapToggle(checked: boolean) {
    logger.info('[customize-basemap] tiled basemap toggled', LogCategory.UI, {
      checked,
      previousStyle: basemapStyleStore.selectedStyle
    });
    if (checked) {
      basemapStyleStore.setStyle(BasemapStyle.CARTE_FACILE_DESATURATED);
    } else {
      basemapStyleStore.setStyle(BasemapStyle.BLANK_WHITE);
    }
    projectStore.markAsDirty();
  }

  function handleLayerChange<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Extract<BasemapLayerConfig, { id: T }>>
  ): void {
    logger.debug('[customize-basemap] layer style updated', LogCategory.UI, {
      layerId: id,
      updates
    });
    basemapLayersStore.updateLayer(id, updates);
    projectStore.markAsDirty();
  }
</script>

<section id="customize-basemap">
  <MainToolBarHeader title={m.step3_title()} icon={PaintBrush} showDivider />

  <div class="content-area">
    <p class="kh-help">{m.step3_description()}</p>
  </div>

  <div class="layers-list">
    <ExpandableSection
      title={m.basemap_layer_terre()}
      showToggle={true}
      toggleChecked={getConfig('terre')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
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
      toggleChecked={getConfig('mers')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
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
      title={m.basemap_layer_lacs()}
      showToggle={true}
      toggleChecked={getConfig('lacs')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('lacs', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={false}
        showThickness={false}
        color={getConfig('lacs')?.color}
        opacity={getConfig('lacs')?.opacity}
        onchange={(updates) => handleLayerChange('lacs', updates)}
      />
    </ExpandableSection>

    <ExpandableSection
      title={m.basemap_layer_rivieres()}
      showToggle={true}
      toggleChecked={getConfig('rivieres')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('rivieres', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={true}
        showThickness={true}
        color={getConfig('rivieres')?.color}
        dotted={getConfig('rivieres')?.dotted}
        dottedPattern={getConfig('rivieres')?.dottedPattern}
        thickness={getConfig('rivieres')?.thickness}
        opacity={getConfig('rivieres')?.opacity}
        onchange={(updates) => handleLayerChange('rivieres', updates)}
      />
    </ExpandableSection>

    <ExpandableSection
      title={m.basemap_layer_relief()}
      showToggle={true}
      toggleChecked={getConfig('relief')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
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
      toggleChecked={getConfig('equateur')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('equateur', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={true}
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
      toggleChecked={getConfig('meridiens')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('meridiens', checked)}
    >
      <LayerConfigMeridiens
        remarquables={getConfig('meridiens')?.remarquables}
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
      showToggle={true}
      toggleChecked={getConfig('frontieres')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
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

    <ExpandableSection
      title={m.basemap_layer_villes()}
      showToggle={true}
      toggleChecked={getConfig('villes')?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
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

    <ExpandableSection
      title={m.basemap_tiled_label()}
      showToggle={true}
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
    color: var(--cds-text-secondary, #6f6f6f);
    font-size: 14px;
    line-height: 18px;
    margin: 0;
  }

  .layers-list {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .tiled-basemap-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-01);
  }
</style>
