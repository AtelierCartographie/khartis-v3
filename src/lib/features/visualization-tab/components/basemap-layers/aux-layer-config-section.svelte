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
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import {
    BasemapGraticuleMode,
    type BasemapDottedPattern
  } from '$lib/features/commons/constants/visualization.constants';
  import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
  import { webglToHex } from '$lib/features/commons/utils/color-utils';
  import { dashArrayToDottedPattern } from '$lib/features/map/layers/layer-helpers';
  import type { BasemapLayer } from '$lib/features/map/types/basemap.types';

  interface Props {
    layer: BasemapLayer;
    basemapFile: string;
    sharedLegacyId?: BasemapLayerId;
    instanceIndex?: number;
    allowRemarkable?: boolean;
  }

  let {
    layer,
    basemapFile,
    sharedLegacyId,
    instanceIndex = 0,
    allowRemarkable = true
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
    if (isPrimaryInstance && legacyId && !isPerKeyLayer) {
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

  // Some basemaps expose several sections mapped to a single legacy config:
  // multiple `land` layers (NUTS territory + surrounding land → `terre`) or
  // several nested `limit` levels (NUTS 3/2/1 → `frontieres`). Styling them
  // through that shared config couples their sliders and loses each level's
  // designed style. Land and limit sections therefore keep their own per-file
  // style override (in the aux store); the style preset is the default and the
  // shared config the fallback.
  const isLandLayer = $derived(
    legacyId === 'terre' && layer.type === BasemapLayerType.LAND
  );
  const isLimitLayer = $derived(
    legacyId === 'frontieres' && layer.type === BasemapLayerType.LIMIT
  );
  const isPerKeyLayer = $derived(isLandLayer || isLimitLayer);

  const perFileStyleOverride = $derived.by<Record<string, unknown>>(() => {
    void basemapAuxLayersStore.version;
    return isPerKeyLayer
      ? (basemapAuxLayersStore.getStyle(basemapFile, renderKey) ?? {})
      : {};
  });

  function getPresetLandFillColor(): string | undefined {
    const presets = basemapService.stylePresets;
    if (!layer.style || !presets) return undefined;
    const preset = presets[layer.style];
    if (preset?.layer_type !== 'solid-polygon') return undefined;
    const [r, g, b, a] = preset.fillColor;
    return webglToHex([r, g, b, a ?? 255]);
  }

  function getPresetPathStyle(): {
    color?: string;
    width?: number;
    dotted?: boolean;
    dottedPattern?: BasemapDottedPattern;
  } {
    const presets = basemapService.stylePresets;
    if (!layer.style || !presets) return {};
    const preset = presets[layer.style];
    if (preset?.layer_type !== 'path') return {};
    const [r, g, b, a] = preset.color;
    return {
      color: webglToHex([r, g, b, a ?? 255]),
      width: preset.width,
      dotted: preset.dashArray ? true : undefined,
      dottedPattern: preset.dashArray
        ? dashArrayToDottedPattern(preset.dashArray)
        : undefined
    };
  }

  function pickString(
    value: unknown,
    fallback: string | undefined
  ): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }
  function pickNumber(
    value: unknown,
    fallback: number | undefined
  ): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : fallback;
  }
  function pickBoolean(
    value: unknown,
    fallback: boolean | undefined
  ): boolean | undefined {
    return typeof value === 'boolean' ? value : fallback;
  }

  const landConfig = $derived.by(() => {
    const base = getConfig('terre');
    const override = perFileStyleOverride;
    return {
      fillColor:
        pickString(override.fillColor, getPresetLandFillColor()) ??
        base?.fillColor,
      fillShadow: pickBoolean(override.fillShadow, base?.fillShadow),
      fillOpacity: pickNumber(override.fillOpacity, base?.fillOpacity),
      strokeColor: pickString(override.strokeColor, base?.strokeColor),
      strokeDotted: pickBoolean(override.strokeDotted, base?.strokeDotted),
      strokeDottedPattern:
        (override.strokeDottedPattern as BasemapDottedPattern | undefined) ??
        base?.strokeDottedPattern,
      strokeThickness: pickNumber(
        override.strokeThickness,
        base?.strokeThickness
      ),
      strokeOpacity: pickNumber(override.strokeOpacity, base?.strokeOpacity)
    };
  });

  const limitConfig = $derived.by(() => {
    const base = getConfig('frontieres');
    const override = perFileStyleOverride;
    const preset = getPresetPathStyle();
    return {
      color: pickString(override.color, preset.color ?? base?.color),
      dotted: pickBoolean(override.dotted, preset.dotted ?? base?.dotted),
      dottedPattern:
        (override.dottedPattern as BasemapDottedPattern | undefined) ??
        preset.dottedPattern ??
        base?.dottedPattern,
      thickness: pickNumber(
        override.thickness,
        preset.width ?? base?.thickness
      ),
      opacity: pickNumber(override.opacity, base?.opacity)
    };
  });

  function handlePerFileStyleChange(updates: Record<string, unknown>): void {
    basemapAuxLayersStore.updateStyle(basemapFile, renderKey, updates);
  }

  function syncGraticuleCompanions(checked: boolean): void {
    basemapLayersStore.setLayerVisibility('meridiens', checked);
    basemapLayersStore.setLayerVisibility('equateur', false);
  }

  function handleToggle(checked: boolean): void {
    if (isPrimaryInstance && legacyId === 'meridiens') {
      syncGraticuleCompanions(checked);
    } else if (isPrimaryInstance && legacyId && !isPerKeyLayer) {
      basemapLayersStore.setLayerVisibility(legacyId, checked);
    }
    basemapAuxLayersStore.setVisible(basemapFile, renderKey, checked);
  }

  function handleLayerChange<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Extract<BasemapLayerConfig, { id: T }>>
  ): void {
    const normalizedUpdates =
      id === 'meridiens' &&
      !allowRemarkable &&
      (updates as Record<string, unknown>).mode ===
        BasemapGraticuleMode.REMARKABLE
        ? { ...updates, mode: BasemapGraticuleMode.REGULAR }
        : updates;
    basemapLayersStore.updateLayer(id, normalizedUpdates);
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
        if (key in normalizedUpdates) {
          equateurUpdates[key] = (normalizedUpdates as Record<string, unknown>)[
            key
          ];
        }
      }
      if (Object.keys(equateurUpdates).length > 0) {
        basemapLayersStore.updateLayer('equateur', equateurUpdates);
      }
      if ('mode' in normalizedUpdates) {
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
    {@const terreView = isLandLayer ? landConfig : getConfig('terre')}
    <LayerConfigTerre
      fillColor={terreView?.fillColor}
      fillShadow={terreView?.fillShadow}
      fillOpacity={terreView?.fillOpacity}
      strokeColor={terreView?.strokeColor}
      strokeDotted={terreView?.strokeDotted}
      strokeDottedPattern={terreView?.strokeDottedPattern}
      strokeThickness={terreView?.strokeThickness}
      strokeOpacity={terreView?.strokeOpacity}
      onchange={(updates) =>
        isLandLayer
          ? handlePerFileStyleChange(updates)
          : handleLayerChange('terre', updates)}
    />
  {:else if legacyId === 'frontieres'}
    {@const limitView = isLimitLayer ? limitConfig : getConfig('frontieres')}
    <LayerConfigSimple
      showColor={true}
      showDotted={true}
      showThickness={true}
      color={limitView?.color}
      dotted={limitView?.dotted}
      dottedPattern={limitView?.dottedPattern}
      thickness={limitView?.thickness}
      opacity={limitView?.opacity}
      onchange={(updates) =>
        isLimitLayer
          ? handlePerFileStyleChange(updates)
          : handleLayerChange('frontieres', updates)}
    />
  {:else if legacyId === 'meridiens'}
    <LayerConfigMeridiens
      mode={getConfig('meridiens')?.mode}
      spacingDegrees={getConfig('meridiens')?.spacingDegrees}
      color={getConfig('meridiens')?.color}
      dotted={getConfig('meridiens')?.dotted}
      dottedPattern={getConfig('meridiens')?.dottedPattern}
      allowRemarkable={allowRemarkable}
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
