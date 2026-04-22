import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readGeoParquetDirectMock: vi.fn(),
  setReferenceBboxFromMetadataMock: vi.fn()
}));

vi.mock('../utils/read-geojson-arrow', () => ({
  readGeoParquetDirect: mocks.readGeoParquetDirectMock
}));

vi.mock('../stores/projection.store.svelte', () => ({
  projectionStore: {
    get referenceBbox() {
      return null;
    },
    setReferenceBboxFromMetadata: mocks.setReferenceBboxFromMetadataMock
  }
}));

const { basemapService } = await import('./basemap.service.svelte');

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createBinaryResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream' }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  basemapService.reset();
  basemapService.clearCache();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('all-basemaps-metadata.json')) {
        return createJsonResponse([
          {
            file: 'europe-nuts2-2024-medium',
            title_fr: 'Europe',
            title_en: 'Europe',
            source: 'test',
            date: '2024',
            bbox: [-63.13, -21.4, 55.86, 80.4],
            proj_source: 'EPSG:4326',
            proj_to: { type: 'composite', preset: 'EUROPE_DOM_TOM' },
            simplification_level: 'medium',
            layers: []
          }
        ]);
      }

      if (
        url.includes('projection-presets.json') ||
        url.includes('style-presets.json')
      ) {
        return createJsonResponse({});
      }

      if (url.includes('europe-nuts2-2024-medium.parquet')) {
        return createBinaryResponse();
      }

      return new Response(null, { status: 404 });
    })
  );
});

describe('basemapService.getBasemapGeometryArrow', () => {
  it('restores currentBasemap when returning geometry from cache', async () => {
    const geometryTable = {
      schema: {
        metadata: new Map([['geo', '{"columns":{"geom":{"bbox":[0,0,1,1]}}}']])
      }
    } as unknown as ArrowTable;

    mocks.readGeoParquetDirectMock.mockReturnValue(geometryTable);

    await basemapService.loadBasemap('europe-nuts2-2024-medium');
    basemapService.reset();

    expect(basemapService.currentBasemap).toBeNull();

    const cachedGeometry = await basemapService.getBasemapGeometryArrow(
      'europe-nuts2-2024-medium'
    );

    expect(cachedGeometry).toBe(geometryTable);
    expect(basemapService.currentMetadata?.file).toBe(
      'europe-nuts2-2024-medium'
    );
    expect(mocks.setReferenceBboxFromMetadataMock).toHaveBeenCalled();
  });
});
