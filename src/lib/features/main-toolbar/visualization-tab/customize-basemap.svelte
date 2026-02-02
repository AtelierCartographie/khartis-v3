<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PaintBrush } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import LayerConfigTerre from './components/basemap-layers/LayerConfigTerre.svelte';
  import LayerConfigSimple from './components/basemap-layers/LayerConfigSimple.svelte';
  import LayerConfigRelief from './components/basemap-layers/LayerConfigRelief.svelte';
  import LayerConfigMeridiens from './components/basemap-layers/LayerConfigMeridiens.svelte';
  import LayerConfigVilles from './components/basemap-layers/LayerConfigVilles.svelte';
  import BasemapStyleSelector from './basemap-style-selector.svelte';
  import MapProjectionSelector from './map-projection-selector.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
  import {
    basemapLayersStore,
    type TerreLayerConfig,
    type MersLayerConfig,
    type LacsLayerConfig,
    type RivieresLayerConfig,
    type ReliefLayerConfig,
    type EquateurLayerConfig,
    type MeridiensLayerConfig,
    type FrontieresLayerConfig,
    type VillesLayerConfig,
    type BasemapLayerId
  } from '$lib/features/map/stores/basemap-layers.store.svelte';

  const terreConfig = $derived(basemapLayersStore.getLayer('terre'));
  const mersConfig = $derived(basemapLayersStore.getLayer('mers'));
  const lacsConfig = $derived(basemapLayersStore.getLayer('lacs'));
  const rivieresConfig = $derived(basemapLayersStore.getLayer('rivieres'));
  const reliefConfig = $derived(basemapLayersStore.getLayer('relief'));
  const equateurConfig = $derived(basemapLayersStore.getLayer('equateur'));
  const meridiensConfig = $derived(basemapLayersStore.getLayer('meridiens'));
  const frontieresConfig = $derived(basemapLayersStore.getLayer('frontieres'));
  const villesConfig = $derived(basemapLayersStore.getLayer('villes'));

  const isTiledBasemapEnabled = $derived(
    basemapStyleStore.selectedStyle !== BasemapStyle.BLANK_WHITE
  );

  // Deck.gl layers are disabled when MapLibre tiled basemap is active
  const areDeckLayersDisabled = $derived(isTiledBasemapEnabled);
  const deckLayersDisabledReason = $derived(
    isTiledBasemapEnabled ? m.basemap_layers_disabled_by_maplibre() : undefined
  );

  // Not implemented layers - kept for future expansion
  // const notImplementedLayers: BasemapLayerId[] = [];
  // const isLayerNotImplemented = (layerId: BasemapLayerId) =>
  //   notImplementedLayers.includes(layerId);
  // const notImplementedReason = m.basemap_layer_not_implemented();

  async function saveImmediately() {
    if (projectStore.currentProject) {
      await projectStore.saveCurrentProject();
    }
  }

  function markProjectDirty() {
    projectStore.markAsDirty();
  }

  async function handleLayerToggle(layerId: BasemapLayerId, checked: boolean) {
    basemapLayersStore.setLayerVisibility(layerId, checked);
    await saveImmediately();
  }

  function handleTiledBasemapToggle(checked: boolean) {
    if (checked) {
      basemapStyleStore.setStyle(BasemapStyle.CARTE_FACILE_DESATURATED);
    } else {
      basemapStyleStore.setStyle(BasemapStyle.BLANK_WHITE);
    }
    markProjectDirty();
  }

  function handleTerreChange(updates: Partial<TerreLayerConfig>) {
    basemapLayersStore.updateLayer('terre', updates);
    markProjectDirty();
  }

  function handleMersChange(updates: Partial<MersLayerConfig>) {
    basemapLayersStore.updateLayer('mers', updates);
    markProjectDirty();
  }

  function handleLacsChange(updates: Partial<LacsLayerConfig>) {
    basemapLayersStore.updateLayer('lacs', updates);
    markProjectDirty();
  }

  function handleRivieresChange(updates: Partial<RivieresLayerConfig>) {
    basemapLayersStore.updateLayer('rivieres', updates);
    markProjectDirty();
  }

  function handleReliefChange(updates: Partial<ReliefLayerConfig>) {
    basemapLayersStore.updateLayer('relief', updates);
    markProjectDirty();
  }

  function handleEquateurChange(updates: Partial<EquateurLayerConfig>) {
    basemapLayersStore.updateLayer('equateur', updates);
    markProjectDirty();
  }

  function handleMeridiensChange(updates: Partial<MeridiensLayerConfig>) {
    basemapLayersStore.updateLayer('meridiens', updates);
    markProjectDirty();
  }

  function handleFrontieresChange(updates: Partial<FrontieresLayerConfig>) {
    basemapLayersStore.updateLayer('frontieres', updates);
    markProjectDirty();
  }

  function handleVillesChange(updates: Partial<VillesLayerConfig>) {
    basemapLayersStore.updateLayer('villes', updates);
    markProjectDirty();
  }
</script>

<section id="customize-basemap">
  <MainToolBarHeader title={m.step3_title()} icon={PaintBrush} />

  <p class="kh-help">{m.step3_description()}</p>

  <div class="layers-list">
    <!-- Terre - Expanded by default -->
    <ExpandableSection
      title={m.basemap_layer_terre()}
      showToggle={true}
      toggleChecked={terreConfig?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('terre', checked)}
      defaultOpen={true}
    >
      <LayerConfigTerre
        fillColor={terreConfig?.fillColor}
        fillShadow={terreConfig?.fillShadow}
        fillOpacity={terreConfig?.fillOpacity}
        strokeColor={terreConfig?.strokeColor}
        strokeDotted={terreConfig?.strokeDotted}
        strokeDottedPattern={terreConfig?.strokeDottedPattern}
        strokeThickness={terreConfig?.strokeThickness}
        strokeOpacity={terreConfig?.strokeOpacity}
        onchange={handleTerreChange}
      />
    </ExpandableSection>

    <!-- Mers/océans -->
    <ExpandableSection
      title={m.basemap_layer_mers()}
      showToggle={true}
      toggleChecked={mersConfig?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('mers', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={false}
        showThickness={false}
        color={mersConfig?.color}
        opacity={mersConfig?.opacity}
        onchange={handleMersChange}
      />
    </ExpandableSection>

    <!-- Lacs et rivières -->
    <ExpandableSection
      title={m.basemap_layer_lacs()}
      showToggle={true}
      toggleChecked={lacsConfig?.visible ?? false}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('lacs', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={false}
        showThickness={false}
        color={lacsConfig?.color}
        opacity={lacsConfig?.opacity}
        onchange={handleLacsChange}
      />
    </ExpandableSection>

    <!-- Rivières (streams) - separate from lacs -->
    <ExpandableSection
      title={m.basemap_layer_rivieres()}
      showToggle={true}
      toggleChecked={rivieresConfig?.visible ?? false}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('rivieres', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={true}
        showThickness={true}
        color={rivieresConfig?.color}
        dotted={rivieresConfig?.dotted}
        dottedPattern={rivieresConfig?.dottedPattern}
        thickness={rivieresConfig?.thickness}
        opacity={rivieresConfig?.opacity}
        onchange={handleRivieresChange}
      />
    </ExpandableSection>

    <!-- Relief -->
    <ExpandableSection
      title={m.basemap_layer_relief()}
      showToggle={true}
      toggleChecked={reliefConfig?.visible ?? false}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('relief', checked)}
    >
      <LayerConfigRelief
        representation={reliefConfig?.representation}
        color={reliefConfig?.color}
        opacity={reliefConfig?.opacity}
        onchange={handleReliefChange}
      />
    </ExpandableSection>

    <!-- Équateur -->
    <ExpandableSection
      title={m.basemap_layer_equateur()}
      showToggle={true}
      toggleChecked={equateurConfig?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('equateur', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={true}
        showThickness={true}
        thicknessMax={20}
        color={equateurConfig?.color}
        dotted={equateurConfig?.dotted}
        dottedPattern={equateurConfig?.dottedPattern}
        thickness={equateurConfig?.thickness}
        opacity={equateurConfig?.opacity}
        onchange={handleEquateurChange}
      />
    </ExpandableSection>

    <!-- Méridiens/parallèles -->
    <ExpandableSection
      title={m.basemap_layer_meridiens()}
      showToggle={true}
      toggleChecked={meridiensConfig?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('meridiens', checked)}
    >
      <LayerConfigMeridiens
        remarquables={meridiensConfig?.remarquables}
        color={meridiensConfig?.color}
        dotted={meridiensConfig?.dotted}
        dottedPattern={meridiensConfig?.dottedPattern}
        thickness={meridiensConfig?.thickness}
        opacity={meridiensConfig?.opacity}
        onchange={handleMeridiensChange}
      />
    </ExpandableSection>

    <!-- Frontières/limites -->
    <ExpandableSection
      title={m.basemap_layer_frontieres()}
      showToggle={true}
      toggleChecked={frontieresConfig?.visible ?? true}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('frontieres', checked)}
    >
      <LayerConfigSimple
        showColor={true}
        showDotted={true}
        showThickness={true}
        thicknessMax={20}
        color={frontieresConfig?.color}
        dotted={frontieresConfig?.dotted}
        dottedPattern={frontieresConfig?.dottedPattern}
        thickness={frontieresConfig?.thickness}
        opacity={frontieresConfig?.opacity}
        onchange={handleFrontieresChange}
      />
    </ExpandableSection>

    <!-- Villes -->
    <ExpandableSection
      title={m.basemap_layer_villes()}
      showToggle={true}
      toggleChecked={villesConfig?.visible ?? false}
      disabled={areDeckLayersDisabled}
      disabledReason={deckLayersDisabledReason}
      onToggleChange={(checked) => handleLayerToggle('villes', checked)}
    >
      <LayerConfigVilles
        category={villesConfig?.category}
        symbol={villesConfig?.symbol}
        color={villesConfig?.color}
        size={villesConfig?.size}
        opacity={villesConfig?.opacity}
        onchange={handleVillesChange}
      />
    </ExpandableSection>

    <!-- Fond de carte tuilé -->
    <ExpandableSection
      title={m.basemap_tiled_label()}
      showToggle={true}
      toggleChecked={isTiledBasemapEnabled}
      onToggleChange={handleTiledBasemapToggle}
      defaultOpen={isTiledBasemapEnabled}
    >
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
    gap: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-helper);
    font-size: 0.875rem;
    line-height: 1.4;
    margin: 0;
  }

  .layers-list {
    display: flex;
    flex-direction: column;
  }

  .tiled-basemap-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-01);
  }
</style>
