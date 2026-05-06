import { describe, expect, it } from 'vitest';
import {
  BasemapStyle,
  DEFAULT_TILED_BASEMAP_STYLE
} from '$lib/features/map/constants/basemap-styles';
import {
  resolveNextTiledStyleSelection,
  resolveTiledStyleContext,
  resolveTiledStyleFromToggle
} from './tiled-basemap-selection.service';

describe('resolveNextTiledStyleSelection', () => {
  it('selects the requested style when it changes', () => {
    expect(
      resolveNextTiledStyleSelection(
        BasemapStyle.BLANK_WHITE,
        BasemapStyle.MONDE_COULEURS,
        false
      )
    ).toBe(BasemapStyle.MONDE_COULEURS);
  });

  it('deselects the current style on second click when no OSM basemap is active', () => {
    expect(
      resolveNextTiledStyleSelection(
        BasemapStyle.FRANCE_COULEURS,
        BasemapStyle.FRANCE_COULEURS,
        false
      )
    ).toBe(BasemapStyle.BLANK_WHITE);
  });

  it('keeps the stored style when the same card is clicked while an OSM basemap is active', () => {
    expect(
      resolveNextTiledStyleSelection(
        BasemapStyle.FRANCE_COULEURS,
        BasemapStyle.FRANCE_COULEURS,
        true
      )
    ).toBe(BasemapStyle.FRANCE_COULEURS);
  });
});

describe('resolveTiledStyleFromToggle', () => {
  it('uses Monde Couleurs as the default first activation style', () => {
    expect(DEFAULT_TILED_BASEMAP_STYLE).toBe(BasemapStyle.MONDE_COULEURS);
    expect(resolveTiledStyleFromToggle(true, BasemapStyle.BLANK_WHITE)).toBe(
      BasemapStyle.MONDE_COULEURS
    );
  });

  it('activates the preferred tiled style when turning tiled basemaps on from blank', () => {
    expect(
      resolveTiledStyleFromToggle(
        true,
        BasemapStyle.BLANK_WHITE,
        BasemapStyle.MONDE_SATELLITE
      )
    ).toBe(BasemapStyle.MONDE_SATELLITE);
  });

  it('keeps the current tiled style when turning tiled basemaps on with an existing selection', () => {
    expect(
      resolveTiledStyleFromToggle(true, BasemapStyle.MONDE_SATELLITE)
    ).toBe(BasemapStyle.MONDE_SATELLITE);
  });

  it('clears the tiled style when turning tiled basemaps off', () => {
    expect(
      resolveTiledStyleFromToggle(true, BasemapStyle.FRANCE_NIVEAUX_DE_GRIS)
    ).toBe(BasemapStyle.FRANCE_NIVEAUX_DE_GRIS);
    expect(
      resolveTiledStyleFromToggle(false, BasemapStyle.FRANCE_NIVEAUX_DE_GRIS)
    ).toBe(BasemapStyle.BLANK_WHITE);
  });
});

describe('resolveTiledStyleContext', () => {
  it('keeps the preferred style context when the tiled basemap is inactive', () => {
    expect(
      resolveTiledStyleContext(
        BasemapStyle.BLANK_WHITE,
        BasemapStyle.MONDE_COULEURS
      )
    ).toBe(BasemapStyle.MONDE_COULEURS);
  });

  it('keeps the active style when a tiled basemap is already selected', () => {
    expect(
      resolveTiledStyleContext(
        BasemapStyle.FRANCE_SATELLITE,
        DEFAULT_TILED_BASEMAP_STYLE
      )
    ).toBe(BasemapStyle.FRANCE_SATELLITE);
  });
});
