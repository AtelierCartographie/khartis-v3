import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'basemap-join-step.svelte'),
  'utf8'
);

describe('BasemapJoinStep reference basemap selection', () => {
  it('keeps GPS datasets on catalog suggestions instead of auto-activating OSM', () => {
    expect(source).not.toContain('shouldAutoPreferOSMForGPS');
    expect(source).not.toContain("autoSelectionTarget === 'osm'");
  });

  it('returns dataset changes to the catalog tab instead of keeping the reference path active', () => {
    expect(source).toContain('basemapSource: BasemapSource.CATALOG');
    expect(source).not.toContain("dataTabActions.selectBasemap('');");
  });

  it('activates Carte Facile Monde Couleurs for the manual reference basemap path', () => {
    expect(source).toContain('BasemapStyle.MONDE_COULEURS');
    expect(source).toContain('osmBasemapStore.clear();');
    expect(source).toContain('basemapStyleStore.setStyle(referenceStyle);');
    expect(source).toContain(
      'basemapStyleStore.requestViewportReset(referenceStyle);'
    );
  });

  it('does not treat a catalog basemap as an active reference basemap', () => {
    expect(source).toContain(
      'isActive={dataTabState.basemapJoin.basemapSource === BasemapSource.OSM &&'
    );
    expect(source).toContain('isOSMBasemapId(basemapSelected)');
    expect(source).not.toContain(
      'dataTabState.basemapJoin.basemapSource === BasemapSource.OSM &&\n        Boolean(basemapSelected)'
    );
  });
});
