import { afterEach, describe, expect, it, vi } from 'vitest';

const assetMock = vi.hoisted(() =>
  vi.fn((path: string) => `/cartographie/khartisnewpprd${path}`)
);

vi.mock('$app/paths', () => ({
  asset: assetMock
}));

describe('getBasemapStyle', () => {
  afterEach(() => {
    assetMock.mockClear();
    vi.unstubAllGlobals();
  });

  it('resolves basemap style JSON relative to the current base URI', async () => {
    vi.stubGlobal('document', {
      baseURI: 'http://127.0.0.1:5176/cartographie/khartisnewpprd/'
    });

    const { BasemapStyle, getBasemapStyle } =
      await import('$lib/features/map/constants/basemap-styles');

    expect(getBasemapStyle(BasemapStyle.FRANCE_NIVEAUX_DE_GRIS)).toBe(
      'http://127.0.0.1:5176/cartographie/khartisnewpprd/basemaps/styles/france-niveaux-de-gris.json'
    );
    expect(assetMock).not.toHaveBeenCalled();
  });

  it('keeps the blank style as an inline MapLibre spec', async () => {
    const { BasemapStyle, getBasemapStyle } =
      await import('$lib/features/map/constants/basemap-styles');

    expect(getBasemapStyle(BasemapStyle.BLANK_WHITE)).toMatchObject({
      version: 8,
      name: BasemapStyle.BLANK_WHITE
    });
  });

  it('defaults tiled basemaps to the world grayscale style', async () => {
    const { BasemapStyle, DEFAULT_TILED_BASEMAP_STYLE } =
      await import('$lib/features/map/constants/basemap-styles');

    expect(DEFAULT_TILED_BASEMAP_STYLE).toBe(
      BasemapStyle.MONDE_NIVEAUX_DE_GRIS
    );
  });

  it('exposes viewport presets per basemap zone', async () => {
    const { BasemapStyle, getBasemapViewportPreset, getBasemapZone } =
      await import('$lib/features/map/constants/basemap-styles');

    expect(getBasemapZone(BasemapStyle.FRANCE_COULEURS)).toBe('france');
    expect(getBasemapViewportPreset(BasemapStyle.FRANCE_COULEURS)).toEqual({
      zone: 'france',
      center: [2.5, 46.7],
      zoom: 4.8,
      bounds: [
        [-5.8, 41.0],
        [10.2, 51.8]
      ]
    });

    expect(getBasemapZone(BasemapStyle.MONDE_NIVEAUX_DE_GRIS)).toBe('monde');
    expect(
      getBasemapViewportPreset(BasemapStyle.MONDE_NIVEAUX_DE_GRIS)
    ).toEqual({
      zone: 'monde',
      center: [0, 20],
      zoom: 1.25,
      bounds: [
        [-170, -55],
        [170, 80]
      ]
    });
  });
});

describe('carte facile zones', () => {
  it('renders the world toggle before the France toggle', async () => {
    const { ZONES } =
      await import('$lib/features/map/constants/carte-facile-layer-groups');

    expect(ZONES.map((zone) => zone.id)).toEqual(['monde', 'france']);
  });
});
