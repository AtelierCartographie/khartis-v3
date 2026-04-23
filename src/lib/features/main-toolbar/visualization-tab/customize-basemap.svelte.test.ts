import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'customize-basemap.svelte'),
  'utf8'
);

describe('CustomizeBasemap', () => {
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
