import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'customize-basemap.svelte'),
  'utf8'
);

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

  it('uses the color reference style as the first activation fallback', () => {
    expect(source).toContain(
      'basemapStyleStore.lastSelectedTiledStyle ?? BasemapStyle.MONDE_COULEURS'
    );
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
    expect(source).toContain('const supportsLakesRivers = $derived(');
    expect(source).toContain('const supportsCities = $derived(');
    expect(source).toContain('!isCustomBasemap &&');
  });
});
