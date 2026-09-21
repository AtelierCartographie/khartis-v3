<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import LayerConfigTerre from './layer-config-terre.svelte';
  import LayerConfigSimple from './layer-config-simple.svelte';
  import LayerConfigRelief from './layer-config-relief.svelte';
  import LayerConfigMeridiens from './layer-config-meridiens.svelte';
  import LayerConfigVilles from './layer-config-villes.svelte';
  import LayerConfigMers from './layer-config-mers.svelte';
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
  import { SYNTHETIC_AUX_LAYER_KEY } from '$lib/features/commons/constants/basemap.constants';
  import { webglToHex } from '$lib/features/commons/utils/color-utils';
  import {
    COLOR_ROLE,
    getColorSuggestions
  } from '$lib/features/commons/services/color-suggestion.service';
  import { resolvePresetLandStroked } from '$lib/features/map/layers/basemap-style-resolve';
  import { dashArrayToDottedPattern } from '$lib/features/map/layers/layer-helpers';
  import type { BasemapLayer } from '$lib/features/map/types/basemap.types';

  interface Props {
    layer: BasemapLayer;
    basemapFile: string;
    sharedLegacyId?: BasemapLayerId;
    instanceIndex?: number;
    allowRemarkable?: boolean;
    allowEquator?: boolean;
    allowSphereOutline?: boolean;
    open?: boolean;
    onToggle?: (expanded: boolean) => void;
  }

  let {
    layer,
    basemapFile,
    sharedLegacyId,
    instanceIndex = 0,
    allowRemarkable = true,
    allowEquator = false,
    allowSphereOutline = true,
    open,
    onToggle
  }: Props = $props();

  const locale = $derived(getLocale());

  function pickTitle(): string {
    const value = locale === 'fr' ? layer.title_fr : layer.title_en;
    return value && value.trim().length > 0
      ? value
      : (layer.title_fr ?? layer.type);
  }

  // The graticule spacing is a control in this very section, so the basemap's
  // own title ("Graticules (10°)") would contradict it.
  const title = $derived(
    sharedLegacyId === 'meridiens' ? m.basemap_layer_meridiens() : pickTitle()
  );
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
      Extract<BasemapLayerConfig, { id: T }> | undefined;
  }

  function isVisible(): boolean {
    if (isPrimaryInstance && legacyId && !isPerKeyLayer) {
      const configId = legacyId === 'meridiens' ? graticuleLayerId : legacyId;
      return (
        (getConfig(configId)?.visible ?? true) &&
        basemapAuxLayersStore.isVisible(basemapFile, renderKey, true)
      );
    }
    return basemapAuxLayersStore.isVisible(basemapFile, renderKey, true);
  }

  const visible = $derived.by(() => {
    void basemapAuxLayersStore.version;
    return isVisible();
  });

  // Land/limit sections keep per-file overrides because legacy shared config couples levels.
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

  function getPresetLandStroked(): boolean | undefined {
    return resolvePresetLandStroked(layer.style, basemapService.stylePresets);
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
      strokeVisible: pickBoolean(
        override.strokeVisible,
        getPresetLandStroked() ?? base?.strokeVisible
      ),
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

  const boundaryColorPresets = $derived(
    getColorSuggestions(COLOR_ROLE.BOUNDARY, getConfig('terre')?.fillColor)
  );

  function handlePerFileStyleChange(updates: Record<string, unknown>): void {
    basemapAuxLayersStore.updateStyle(basemapFile, renderKey, updates);
  }

  // The graticule mode picks which of the two render layers carries the section:
  // the equator line is its own layer, the meridians/parallels another.
  const storedGraticuleMode = $derived(
    getConfig('meridiens')?.mode ?? BasemapGraticuleMode.REMARKABLE
  );
  const graticuleMode = $derived(
    (storedGraticuleMode === BasemapGraticuleMode.REMARKABLE &&
      !allowRemarkable) ||
      (storedGraticuleMode === BasemapGraticuleMode.EQUATOR && !allowEquator)
      ? BasemapGraticuleMode.REGULAR
      : storedGraticuleMode
  );
  const graticuleLayerId = $derived<BasemapLayerId>(
    graticuleMode === BasemapGraticuleMode.EQUATOR ? 'equateur' : 'meridiens'
  );

  function syncGraticuleCompanions(
    checked: boolean,
    mode: BasemapGraticuleMode = graticuleMode
  ): void {
    const active: BasemapLayerId =
      mode === BasemapGraticuleMode.EQUATOR ? 'equateur' : 'meridiens';
    basemapLayersStore.setLayerVisibility(active, checked);
    basemapLayersStore.setLayerVisibility(
      active === 'meridiens' ? 'equateur' : 'meridiens',
      false
    );
  }

  function handleToggle(checked: boolean): void {
    if (isPrimaryInstance && legacyId === 'meridiens') {
      syncGraticuleCompanions(checked);
    } else if (isPrimaryInstance && legacyId && !isPerKeyLayer) {
      basemapLayersStore.setLayerVisibility(legacyId, checked);
    }
    basemapAuxLayersStore.setVisible(basemapFile, renderKey, checked);
  }

  const sphereConfig = $derived(getConfig('sphere'));
  const sphereOutlineVisible = $derived.by(() => {
    void basemapAuxLayersStore.version;
    return (
      (sphereConfig?.visible ?? true) &&
      basemapAuxLayersStore.isVisible(
        basemapFile,
        SYNTHETIC_AUX_LAYER_KEY.SPHERE,
        true
      )
    );
  });

  function handleSphereOutlineVisibility(visible: boolean): void {
    basemapLayersStore.setLayerVisibility('sphere', visible);
    basemapAuxLayersStore.setVisible(
      basemapFile,
      SYNTHETIC_AUX_LAYER_KEY.SPHERE,
      visible
    );
  }

  function handleLayerChange<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Extract<BasemapLayerConfig, { id: T }>>
  ): void {
    const requestedMode = (updates as Record<string, unknown>).mode;
    const isUnavailableMode =
      (requestedMode === BasemapGraticuleMode.REMARKABLE && !allowRemarkable) ||
      (requestedMode === BasemapGraticuleMode.EQUATOR && !allowEquator);
    const normalizedUpdates =
      id === 'meridiens' && isUnavailableMode
        ? { ...updates, mode: BasemapGraticuleMode.REGULAR }
        : updates;
    basemapLayersStore.updateLayer(id, normalizedUpdates);
    if (id === 'meridiens') {
      const nextMode = (normalizedUpdates as Record<string, unknown>).mode;
      if (nextMode !== undefined) {
        const isVisible = basemapAuxLayersStore.isVisible(
          basemapFile,
          renderKey,
          true
        );
        syncGraticuleCompanions(isVisible, nextMode as BasemapGraticuleMode);
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
  open={open}
  onToggle={onToggle}
  onToggleChange={handleToggle}
>
  {#if legacyId === 'terre'}
    {@const terreView = isLandLayer ? landConfig : getConfig('terre')}
    <LayerConfigTerre
      fillColor={terreView?.fillColor}
      fillShadow={terreView?.fillShadow}
      fillOpacity={terreView?.fillOpacity}
      strokeVisible={terreView?.strokeVisible}
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
      colorPresets={boundaryColorPresets}
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
      allowEquator={allowEquator}
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
    <LayerConfigMers
      color={getConfig('mers')?.color}
      opacity={getConfig('mers')?.opacity}
      showOutline={allowSphereOutline}
      outlineVisible={sphereOutlineVisible}
      outlineColor={sphereConfig?.color}
      outlineThickness={sphereConfig?.thickness}
      outlineOpacity={sphereConfig?.opacity}
      onchange={(updates) => handleLayerChange('mers', updates)}
      onoutlinechange={(updates) => handleLayerChange('sphere', updates)}
      onoutlinevisibilitychange={handleSphereOutlineVisibility}
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
  {/if}
</ExpandableSection>
