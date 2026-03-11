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

    expect(getBasemapStyle(BasemapStyle.CARTE_FACILE_SIMPLE)).toBe(
      'http://127.0.0.1:5176/cartographie/khartisnewpprd/basemaps/styles/carte-facile-simple.json'
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
});
