import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'customize-basemap.svelte'),
  'utf8'
);
const auxSectionSource = readFileSync(
  resolve(
    import.meta.dirname,
    'basemap-layers/aux-layer-config-section.svelte'
  ),
  'utf8'
);
const catalogMetadata = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'static/basemaps/all-basemaps-metadata.json'),
    'utf8'
  )
) as Array<{ file: string; layers?: Array<{ type?: string }> }>;

describe('CustomizeBasemap', () => {
  it('keeps the reference basemap tool inside the tiled expandable so it can be disabled again', () => {
    expect(source).toContain('!isTiledBasemapEnabled');
    expect(source).toContain('title={m.basemap_tiled_label()}');
    expect(source).toContain('toggleChecked={isTiledBasemapEnabled}');
    expect(source).toContain('onToggleChange={handleTiledBasemapToggle}');
    expect(source).toContain('class="reference-basemap-tool"');
    expect(source).toContain('{m.basemap_tiled_helper()}');
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

  it('iterates over currentMetadata.layers to render one entry per declared layer (issue #156 contract)', () => {
    expect(source).toContain('layerEntries');
    expect(source).toContain('metadata.layers');
    expect(source).toContain('{#each layerEntries as entry');
    expect(source).toContain('<AuxLayerConfigSection');
  });

  it('drops the duplicated "Couches du fond de carte" parallel section that doubled the catalog list', () => {
    expect(source).not.toContain('basemap_layer_section_aux');
  });

  it('tracks the instance index per type so multiple layers of the same type (Europe NUTS 1 + NUTS 2 limits) render as distinct sections', () => {
    expect(source).toContain('typeCounters');
    expect(source).toContain('instanceIndex');
  });

  it('maps every catalog layer type to a legacy id so the rendering pipeline stays wired', () => {
    expect(source).toContain('mapLayerTypeToLegacyId');
    expect(source).toContain('BasemapLayerType.LAND');
    expect(source).toContain('BasemapLayerType.LIMIT');
    expect(source).toContain('BasemapLayerType.CENTROID');
    expect(source).toContain('BasemapLayerType.POINT');
    expect(source).toContain('BasemapLayerType.GRATICULE');
    expect(source).toContain('BasemapLayerType.GEOGRAPHIC_LINES');
    expect(source).toContain('BasemapLayerType.POLYGON');
    expect(source).toContain('BasemapLayerType.LINE');
  });

  it('hides catalog-only legacy layer ids on imported basemaps so old controls stop leaking', () => {
    expect(source).toContain('hiddenCustomLayerIds');
    expect(source).toContain("'mers'");
    expect(source).toContain("'lacs'");
    expect(source).toContain("'rivieres'");
    expect(source).toContain("'relief'");
    expect(source).toContain("'equateur'");
    expect(source).toContain("'meridiens'");
    expect(source).toContain("'villes'");
  });

  it('derives current metadata exclusively from the user-selected reference basemap (not from cached service state)', () => {
    expect(source).toContain('getActiveReferenceBasemapMetadata');
    expect(source).toContain('basemapStyleStore.referenceBasemapId');
    expect(source).toContain('resolveActiveBasemapMetadata');
  });

  it('returns null metadata when no reference basemap is selected, never falling back to stale cache', () => {
    const helperStart = source.indexOf(
      'function getActiveReferenceBasemapMetadata'
    );
    const helperEnd = source.indexOf('const currentMetadata', helperStart);
    const helperSource = source.slice(helperStart, helperEnd);

    expect(helperSource).toContain('if (!referenceBasemapId)');
    expect(helperSource).toContain('return null;');
    expect(helperSource).not.toContain(
      'return basemapService.currentMetadata;'
    );
  });

  it('renders the Meridiens config component from the catalog graticule layer mapping', () => {
    expect(catalogLayerTypes()).toContain('graticule');
    expect(auxSectionSource).toContain('<LayerConfigMeridiens');
    expect(auxSectionSource).toContain("legacyId === 'meridiens'");
  });

  it('renders city controls from catalog centroid or point metadata layers', () => {
    expect(catalogLayerTypes()).toContain('centroid');
    expect(auxSectionSource).toContain('<LayerConfigVilles');
    expect(auxSectionSource).toContain("legacyId === 'villes'");
  });

  it('keeps lakes and rivers visibility/styles synchronized when toggled from the Mers/Polygones layer slot', () => {
    expect(auxSectionSource).toContain('handleLacsRivieresChange');
    expect(auxSectionSource).toContain(
      "basemapLayersStore.updateLayer('lacs', shared)"
    );
    expect(auxSectionSource).toContain(
      "basemapLayersStore.updateLayer('rivieres', shared)"
    );
    expect(auxSectionSource).toContain(
      "basemapLayersStore.updateLayer('rivieres', {"
    );
  });

  it('renders the same style controls for secondary instances of the same type so users always see the expected color/thickness/opacity inputs', () => {
    // Secondary instances (e.g. second NUTS limit, second land "Territoire") must
    // not fall back to a plain helper text — they must show the same controls
    // as the primary instance with a shared style override.
    expect(auxSectionSource).not.toContain('basemap_aux_secondary_helper()');
    expect(auxSectionSource).not.toContain(
      'basemap_aux_secondary_limit_helper()'
    );
  });

  it('passes catalog metadata default visibility to the rendered aux layer sections', () => {
    expect(source).toContain('getBasemapAuxLayerDefaultVisibility');
    expect(source).toContain(
      'defaultVisible: getBasemapAuxLayerDefaultVisibility'
    );
    expect(source).toContain('defaultVisible={entry.defaultVisible}');
    expect(auxSectionSource).toContain('defaultVisible = true');
    expect(auxSectionSource).toContain(
      'basemapAuxLayersStore.isVisible(basemapFile, renderKey, defaultVisible)'
    );
    expect(auxSectionSource).toContain(
      'basemapAuxLayersStore.isVisible(\n      basemapFile,\n      renderKey,\n      defaultVisible\n    )'
    );
  });
});

function catalogLayerTypes(): Set<string> {
  return new Set(
    catalogMetadata.flatMap((basemap) =>
      (basemap.layers ?? []).map((layer) => layer.type ?? '')
    )
  );
}
