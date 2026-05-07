import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'basemap-style-selector.svelte'),
  'utf8'
);

describe('BasemapStyleSelector', () => {
  it('renders the Figma reference-basemap scale, preview, layer, and learn-more affordances', () => {
    expect(source).toContain('m.basemap_scale_label()');
    expect(source).toContain('BasemapCardVertical');
    expect(source).toContain('m.basemap_tiled_zoom_helper()');
    expect(source).toContain('m.basemap_reference_data_learn_more()');
  });

  it('shows a Carte Facile loading indicator inside the reference controls', () => {
    expect(source).toContain('InlineLoading');
    expect(source).toContain('mapLoadingStore.isReferenceBasemapLoading');
    expect(source).toContain('{#if isReferenceBasemapLoading}');
    expect(source).toContain('description={m.basemap_loading()}');
  });

  it('uses the shared toggle tabs component for the France and World scale switch', () => {
    expect(source).toContain('ToggleTabs');
    expect(source).toContain('items={zoneOptions}');
    expect(source).toContain('onChange={handleZoneToggle}');
    expect(source).not.toContain('class="scale-field"');
    expect(source).not.toContain('Search');
  });

  it('uses the shared gray basemap card component for style choices', () => {
    expect(source).toContain('BasemapCardVertical');
    expect(source).toContain('variant="gray"');
    expect(source).toContain('showMetadata={false}');
    expect(source).not.toContain('class="style-card"');
  });

  it('uses the shared custom checkbox layer controls', () => {
    expect(source).toContain('SimpleCheckbox');
    expect(source).toContain(
      'onchange={() => handleReferenceLayerToggle(layer)}'
    );
    expect(source).not.toContain('<Checkbox');
    expect(source).not.toContain('on:check');
    expect(source).not.toContain('ToggleWithLabel');
  });

  it('offers an explicit world globe checkbox and keeps France on the flat projection', () => {
    expect(source).toContain('mapProjectionStore.isGlobe');
    expect(source).toContain("selectedZone === 'france'");
    expect(source).toContain('MAP_PROJECTION_TYPE.MERCATOR');

    expect(source).not.toContain(
      "selectedZone === 'monde' &&\n      mapProjectionStore.isGlobe &&\n      !mapProjectionStore.isGlobeExplicitlyEnabled"
    );
    expect(source).toContain('labelText={m.map_projection_globe()}');
    expect(source).toContain('checked={isGlobeProjectionEnabled}');
    expect(source).toContain('onchange={handleGlobeProjectionToggle}');
    expect(source).toContain('explicit: true');
  });

  it('filters layer controls to the groups available in the active Carte Facile style', () => {
    expect(source).toContain('getToggleableGroups');
    expect(source).toContain('currentToggleableGroupIds');
    expect(source).toContain('{#each referenceLayerItems as layer (layer.id)}');
    expect(source).toContain("id: 'admin-boundaries'");
    expect(source).toContain('m.carte_facile_group_admin_boundaries()');
  });

  it('requests a viewport reset when switching between World and France styles', () => {
    expect(source).toContain('basemapStyleStore.setStyle(nextStyle);');
    expect(source).toContain(
      'basemapStyleStore.requestViewportReset(nextStyle);'
    );
  });

  it('activates the color style by default for a restored OSM basemap with no tiled history', () => {
    expect(source).toContain('osmBasemapStore.isActive');
    expect(source).toContain('BasemapStyle.MONDE_COULEURS');
    expect(source).toContain('!basemapStyleStore.lastSelectedTiledStyle');
  });

  it('returns to the flat projection when replacing an OSM basemap with a tiled style', () => {
    expect(source).toContain(
      'const hasActiveOSMBasemap = osmBasemapStore.isActive'
    );
    expect(source).toContain('if (hasActiveOSMBasemap) {');
    expect(source).toContain('setFlatProjection();');
    expect(source).toContain('osmBasemapStore.clear();');
  });
});
