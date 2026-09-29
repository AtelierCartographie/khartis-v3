import { afterEach, describe, expect, it, vi } from 'vitest';
import '$lib/features/commons/stores/locale.store.svelte';
import { setLocale } from '$lib/paraglide/runtime.js';
import * as m from '$lib/paraglide/messages';
import { BASEMAP_FETCH_TIMEOUT_MS } from '$lib/features/map/constants/basemap-fetch.constants';
import { unzipSync } from 'fflate';
import {
  bundleBasemapImportFiles,
  createOSMBasemap,
  loadBasemapFromUrl,
  processBasemapImport
} from './basemap-import.service';

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('processBasemapImport', () => {
  it('throws a ParseError for standalone shapefiles without companions', async () => {
    await expect(
      processBasemapImport(new File([''], 'regions.shp'))
    ).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'shapefile',
      details: {
        fileName: 'regions.shp',
        missingComponents: ['.shx', '.dbf']
      }
    });
  });
});

describe('bundleBasemapImportFiles', () => {
  it('zips the loose parts of a shapefile into one archive', async () => {
    const parts = ['regions.shp', 'regions.shx', 'regions.dbf', 'regions.prj'];
    const bundle = await bundleBasemapImportFiles(
      parts.map((name) => new File([name], name))
    );

    expect(bundle.name).toBe('regions.zip');
    const entries = unzipSync(new Uint8Array(await bundle.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual([...parts].sort());
  });

  it('reports the required components missing from a loose shapefile', async () => {
    await expect(
      bundleBasemapImportFiles([
        new File([''], 'regions.shp'),
        new File([''], 'regions.prj')
      ])
    ).rejects.toMatchObject({
      name: 'ParseError',
      details: { missingComponents: ['.shx', '.dbf'] }
    });
  });

  it('rejects files that do not form a single basemap', async () => {
    await expect(
      bundleBasemapImportFiles([
        new File([''], 'regions.geojson'),
        new File([''], 'communes.geojson')
      ])
    ).rejects.toMatchObject({ name: 'ParseError' });
  });
});

describe('loadBasemapFromUrl', () => {
  it('throws a PipelineError when the remote basemap cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)
    );

    await expect(
      loadBasemapFromUrl('https://example.test/missing.geojson')
    ).rejects.toMatchObject({
      name: 'PipelineError',
      code: 'BASEMAP_URL_LOAD_ERROR',
      details: {
        url: 'https://example.test/missing.geojson',
        status: 404
      }
    });
  });

  it('should reject when a successful basemap response body never completes', async () => {
    vi.useFakeTimers();
    const url = 'https://example.test/pending.geojson';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ start: () => undefined }), {
          status: 200
        })
      )
    );

    const request = loadBasemapFromUrl(url);
    const rejection = expect(request).rejects.toMatchObject({
      name: 'PipelineError',
      code: 'BASEMAP_URL_LOAD_ERROR',
      message: m.error_download_timeout(),
      details: {
        url,
        timeoutMs: BASEMAP_FETCH_TIMEOUT_MS
      }
    });

    await vi.advanceTimersByTimeAsync(BASEMAP_FETCH_TIMEOUT_MS);
    await rejection;
  });
});

describe('createOSMBasemap', () => {
  it('stores separate French and English metadata labels regardless of the active locale', async () => {
    await setTestLocale('fr');

    const basemapFromFrenchUi = createOSMBasemap();

    expect(basemapFromFrenchUi.title_fr).toBe(
      m.basemap_osm({}, { locale: 'fr' })
    );
    expect(basemapFromFrenchUi.title_en).toBe(
      m.basemap_osm({}, { locale: 'en' })
    );
    expect(basemapFromFrenchUi.subtitle_fr).toBe(
      m.osm_basemap_description({}, { locale: 'fr' })
    );
    expect(basemapFromFrenchUi.subtitle_en).toBe(
      m.osm_basemap_description({}, { locale: 'en' })
    );
    expect(basemapFromFrenchUi.layers[0]?.title_fr).toBe(
      m.layer_title_base({}, { locale: 'fr' })
    );
    expect(basemapFromFrenchUi.layers[0]?.title_en).toBe(
      m.layer_title_base({}, { locale: 'en' })
    );

    await setTestLocale('en');

    const basemapFromEnglishUi = createOSMBasemap();

    expect(basemapFromEnglishUi.title_fr).toBe(
      m.basemap_osm({}, { locale: 'fr' })
    );
    expect(basemapFromEnglishUi.title_en).toBe(
      m.basemap_osm({}, { locale: 'en' })
    );
  });
});
