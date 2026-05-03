import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'customize-basemap.svelte'),
  'utf8'
);
const catalogMetadata = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'static/basemaps/all-basemaps-metadata.json'),
    'utf8'
  )
) as Array<{ layers?: Array<{ type?: string }> }>;

describe('CustomizeBasemap', () => {
  it('keeps the reference basemap tool inside the tiled expandable so it can be disabled again', () => {
    expect(source).toContain('{#if !isTiledBasemapEnabled}');
    expect(source).toContain('title={m.basemap_tiled_label()}');
    expect(source).toContain('toggleChecked={isTiledBasemapEnabled}');
    expect(source).toContain('onToggleChange={handleTiledBasemapToggle}');
    expect(source).toContain('class="reference-basemap-tool"');
    expect(source).toContain('{m.basemap_tiled_helper()}');
    expect(source).not.toContain('{#if isTiledBasemapEnabled}');
  });

  it('defaults to Monde on first activation from blank white', () => {
    expect(source).toContain('const isFirstActivation =');
    expect(source).toContain(
      'checked && basemapStyleStore.selectedStyle === BasemapStyle.BLANK_WHITE'
    );
    expect(source).toContain('? BasemapStyle.MONDE_COULEURS');
  });

  it('falls back to last selected tiled style after the first activation', () => {
    expect(source).toContain('basemapStyleStore.lastSelectedTiledStyle ??');
    expect(source).toContain('BasemapStyle.MONDE_COULEURS');
  });

  it('starts the reference basemap in the flat projection when the tool is enabled', () => {
    expect(source).toContain('mapProjectionStore.isGlobe');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR)'
    );
  });

  it('switches imported basemaps to a reduced fill and stroke panel', () => {
    const customBranch = source.match(/{#if isCustomBasemap}([\s\S]*?){:else}/);
    expect(customBranch).not.toBeNull();

    const branch = customBranch![1];

    expect(branch).toContain('title={m.basemap_config_fill()}');
    expect(branch).toContain('title={m.basemap_config_stroke()}');
    expect(branch).toContain('showStrokeSection={false}');
    expect(branch).not.toContain('title={m.basemap_layer_mers()}');
    expect(branch).not.toContain('title={m.basemap_layer_lacs_rivieres()}');
    expect(branch).not.toContain('title={m.basemap_layer_relief()}');
    expect(branch).not.toContain('title={m.basemap_layer_equateur()}');
    expect(branch).not.toContain('title={m.basemap_layer_meridiens()}');
    expect(branch).not.toContain('title={m.basemap_layer_villes()}');
  });

  it('keeps mers on LayerConfigSimple so simple basemap colors inherit the shared control', () => {
    expect(source).toContain('title={m.basemap_layer_mers()}');
    expect(source).toContain('<LayerConfigSimple');
  });

  it('disables catalog-only overlays when the active basemap is imported', () => {
    expect(source).toContain('const hiddenCustomLayerIds = $derived.by(() =>');
    expect(source).toContain("'mers'");
    expect(source).toContain("'lacs'");
    expect(source).toContain("'rivieres'");
    expect(source).toContain("'relief'");
    expect(source).toContain("'equateur'");
    expect(source).toContain("'meridiens'");
    expect(source).toContain("'villes'");
    expect(source).toContain('if (getConfig(layerId)?.visible ?? false)');
  });

  it('stops advertising catalog-only metadata layers on imported basemaps', () => {
    expect(source).toContain('const supportsCatalogGeometry = $derived(');
    expect(source).toContain('const supportsLakesRivers = $derived(');
    expect(source).toContain('const supportsCities = $derived(');
    expect(source).toContain('!isCustomBasemap &&');
  });

  it('disables catalog geometry layers when no basemap geometry is active', () => {
    expect(source).toContain('toggleDisabled={!supportsCatalogGeometry}');
    expect(source).toContain('disabled={!supportsCatalogGeometry}');
    expect(source).toMatch(
      /supportsCatalogGeometry &&\s+\(getConfig\('terre'\)\?\.visible \?\? true\)/
    );
    expect(source).toMatch(
      /supportsCatalogGeometry &&\s+\(getConfig\('frontieres'\)\?\.visible \?\? true\)/
    );
  });

  it('derives overlay support from the selected reference basemap metadata', () => {
    expect(source).toContain('getPreferredBasemapFile');
    expect(source).toContain('getReferenceBasemapMetadata');
    expect(source).toContain('basemapStyleStore.referenceBasemapId');
    expect(source).toContain('basemapService.availableBasemaps.find');
  });

  it('enables city controls from catalog centroid or point metadata', () => {
    const layerTypes = new Set(
      catalogMetadata.flatMap((basemap) =>
        (basemap.layers ?? []).map((layer) => layer.type)
      )
    );

    expect(layerTypes.has('centroid')).toBe(true);
    expect(source).toContain(
      'availableMetadataLayerTypes.has(BasemapLayerType.CENTROID)'
    );
    expect(source).toContain(
      'availableMetadataLayerTypes.has(BasemapLayerType.POINT)'
    );
  });

  it('keeps lakes and rivers unavailable while the catalog has no hydrography layers', () => {
    const layerTypes = new Set(
      catalogMetadata.flatMap((basemap) =>
        (basemap.layers ?? []).map((layer) => layer.type)
      )
    );

    expect(layerTypes.has('polygon')).toBe(false);
    expect(layerTypes.has('line')).toBe(false);
    expect(source).toContain('toggleDisabled={!supportsLakesRivers}');
    expect(source).toContain('disabled={!supportsLakesRivers}');
    expect(source).toContain('disabledReason={!supportsLakesRivers');
  });

  it('connects meridiens controls to mode and spacing instead of the legacy selector', () => {
    expect(source).toContain('<LayerConfigMeridiens');
    expect(source).toContain("mode={getConfig('meridiens')?.mode}");
    expect(source).toContain(
      "spacingDegrees={getConfig('meridiens')?.spacingDegrees}"
    );
    expect(source).not.toContain("remarquables={getConfig('meridiens')");
  });

  it('keeps equator and graticule styling independent from catalog metadata availability', () => {
    expect(source).not.toContain('supportsEquatorDotted');
    expect(source).not.toContain('supportsMeridiansDotted');
    expect(source).not.toContain('disableDotted={!supportsEquatorDotted}');
    expect(source).not.toContain('disableDotted={!supportsMeridiansDotted}');
  });

  it('keeps the lakes and rivers toggle synchronized while styling rivers thickness only', () => {
    expect(source).toContain(
      "basemapLayersStore.setLayerVisibility('lacs', checked)"
    );
    expect(source).toContain(
      "basemapLayersStore.setLayerVisibility('rivieres', checked)"
    );
    expect(source).toContain("basemapLayersStore.updateLayer('lacs', shared)");
    expect(source).toContain(
      "basemapLayersStore.updateLayer('rivieres', shared)"
    );
    expect(source).toContain("basemapLayersStore.updateLayer('rivieres', {");
    expect(source).not.toContain("basemapLayersStore.updateLayer('lacs', {");
  });

  it('uses the shared basemap thickness limits instead of hardcoded wide bounds', () => {
    expect(source).not.toContain('thicknessMax={20}');
  });
});
