<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import LayerConfigTerre from './layer-config-terre.svelte';
  import LayerConfigSimple from './layer-config-simple.svelte';
  import LayerConfigRelief from './layer-config-relief.svelte';
  import LayerConfigMeridiens from './layer-config-meridiens.svelte';
  import LayerConfigVilles from './layer-config-villes.svelte';
  import {
    basemapLayersStore,
    type BasemapLayerConfig,
    type BasemapLayerId
  } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { basemapAuxLayersStore } from '$lib/features/map/stores/basemap-aux-layers.store.svelte';
  import { BasemapGraticuleMode } from '$lib/features/commons/constants/visualization.constants';
  import type { BasemapLayer } from '$lib/features/map/types/basemap.types';

  interface Props {
    layer: BasemapLayer;
    basemapFile: string;
    sharedLegacyId?: BasemapLayerId;
    instanceIndex?: number;
  }

  let {
    layer,
    basemapFile,
    sharedLegacyId,
    instanceIndex = 0
  }: Props = $props();

  const locale = $derived(getLocale());

  function pickTitle(): string {
    const value = locale === 'fr' ? layer.title_fr : layer.title_en;
    return value && value.trim().length > 0
      ? value
      : (layer.title_fr ?? layer.type);
  }

  const title = $derived(pickTitle());
  const renderKey = $derived(layer.file ?? `${basemapFile}:${layer.type}`);

  const isPrimaryInstance = $derived(instanceIndex === 0);
  const legacyId: BasemapLayerId | null = $derived(sharedLegacyId ?? null);

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

  function isVisible(): boolean {
    if (isPrimaryInstance && legacyId) {
      return (
        (getConfig(legacyId)?.visible ?? true) &&
        basemapAuxLayersStore.isVisible(basemapFile, renderKey, true)
      );
    }
    return basemapAuxLayersStore.isVisible(basemapFile, renderKey, true);
  }

  const visible = $derived.by(() => {
    void basemapAuxLayersStore.version;
    return isVisible();
  });

  function syncGraticuleCompanions(checked: boolean): void {
    const meridiensConfig = getConfig('meridiens');
    const isRemarkable =
      meridiensConfig?.mode === BasemapGraticuleMode.REMARKABLE;
    basemapLayersStore.setLayerVisibility('equateur', checked && isRemarkable);
    basemapLayersStore.setLayerVisibility(
      'meridiens',
      checked && !isRemarkable
    );
  }

  function handleToggle(checked: boolean): void {
    if (isPrimaryInstance && legacyId === 'meridiens') {
      syncGraticuleCompanions(checked);
    } else if (isPrimaryInstance && legacyId) {
      basemapLayersStore.setLayerVisibility(legacyId, checked);
    }
    basemapAuxLayersStore.setVisible(basemapFile, renderKey, checked);
  }

  function handleLayerChange<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Extract<BasemapLayerConfig, { id: T }>>
  ): void {
    basemapLayersStore.updateLayer(id, updates);
    if (id === 'meridiens') {
      const sharedKeys = [
        'color',
        'dotted',
        'dottedPattern',
        'thickness',
        'opacity'
      ] as const;
      const equateurUpdates: Record<string, unknown> = {};
      for (const key of sharedKeys) {
        if (key in updates) {
          equateurUpdates[key] = (updates as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(equateurUpdates).length > 0) {
        basemapLayersStore.updateLayer('equateur', equateurUpdates);
      }
      if ('mode' in updates) {
        const isVisible = basemapAuxLayersStore.isVisible(
          basemapFile,
          renderKey,
          true
        );
        syncGraticuleCompanions(isVisible);
      }
    }
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
</script>

<ExpandableSection
  title={title}
  showToggle={true}
  toggleVariant="suggestions"
  toggleChecked={visible}
  onToggleChange={handleToggle}
>
  {#if legacyId === 'terre'}
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
  {:else if legacyId === 'frontieres'}
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
  {:else if legacyId === 'meridiens'}
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
  {:else if legacyId === 'equateur'}
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
  {:else if legacyId === 'villes'}
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
  {:else if legacyId === 'mers'}
    <LayerConfigSimple
      showColor={true}
      showDotted={false}
      showThickness={false}
      color={getConfig('mers')?.color}
      opacity={getConfig('mers')?.opacity}
      onchange={(updates) => handleLayerChange('mers', updates)}
    />
  {:else if legacyId === 'lacs'}
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
  {:else if legacyId === 'relief'}
    <LayerConfigRelief
      representation={getConfig('relief')?.representation}
      color={getConfig('relief')?.color}
      opacity={getConfig('relief')?.opacity}
      onchange={(updates) => handleLayerChange('relief', updates)}
    />
  {:else if legacyId === 'sphere'}
    <LayerConfigSimple
      showColor={true}
      showDotted={false}
      showThickness={true}
      color={getConfig('sphere')?.color}
      thickness={getConfig('sphere')?.thickness}
      opacity={getConfig('sphere')?.opacity}
      onchange={(updates) => handleLayerChange('sphere', updates)}
    />
  {/if}
</ExpandableSection>
