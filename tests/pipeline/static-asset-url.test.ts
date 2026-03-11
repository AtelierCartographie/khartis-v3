import { afterEach, describe, expect, it, vi } from 'vitest';

const assetMock = vi.hoisted(() =>
  vi.fn((path: string) => `/cartographie/khartisnewpprd${path}`)
);

vi.mock('$app/paths', () => ({
  asset: assetMock
}));

describe('resolveStaticAssetUrl', () => {
  afterEach(() => {
    assetMock.mockClear();
    vi.unstubAllGlobals();
  });

  it('uses document.baseURI when available in the browser', async () => {
    vi.stubGlobal('document', {
      baseURI: 'http://127.0.0.1:5176/cartographie/khartisnewpprd/'
    });

    const { resolveStaticAssetUrl } =
      await import('$lib/features/commons/utils/static-asset-url');

    expect(
      resolveStaticAssetUrl('/basemaps/geometry/world-countries-50m.geojson')
    ).toBe(
      'http://127.0.0.1:5176/cartographie/khartisnewpprd/basemaps/geometry/world-countries-50m.geojson'
    );
    expect(assetMock).not.toHaveBeenCalled();
  });

  it('falls back to SvelteKit asset resolution outside the browser', async () => {
    const { resolveStaticAssetUrl } =
      await import('$lib/features/commons/utils/static-asset-url');

    expect(resolveStaticAssetUrl('basemaps/all-basemaps-metadata.json')).toBe(
      '/cartographie/khartisnewpprd/basemaps/all-basemaps-metadata.json'
    );
    expect(assetMock).toHaveBeenCalledWith(
      '/basemaps/all-basemaps-metadata.json'
    );
  });
});
