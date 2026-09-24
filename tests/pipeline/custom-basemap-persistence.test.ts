import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRef } from '$lib/features/commons/types/create-project.types';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { PROJECT_CONST } from '$lib/features/project-management/constants';

const fakes = vi.hoisted(() => {
  const assets = new Map<
    string,
    { ref: AssetRef; bytes: Uint8Array<ArrayBuffer> }
  >();
  const duckTables = new Set<string>();
  const attributeRows: Array<Record<string, unknown>> = [];
  return {
    assets,
    duckTables,
    attributeRows,
    processBasemapImport: vi.fn(),
    registerCustomBasemap: vi.fn(),
    referenceBasemap: { id: null as string | null },
    showWarning: vi.fn()
  };
});

async function toBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

vi.mock(
  '$lib/features/project-management/services/asset-store.service',
  () => ({
    async createAssetRefFromFile(file: File, kind: AssetRef['kind']) {
      const ref: AssetRef = {
        assetId: `asset-${fakes.assets.size + 1}`,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind
      };
      fakes.assets.set(ref.assetId, { ref, bytes: await toBytes(file) });
      return ref;
    },
    async createFileFromAssetRef(ref: AssetRef) {
      const stored = fakes.assets.get(ref.assetId);
      if (!stored) {
        throw new Error(`Missing asset ${ref.assetId}`);
      }
      return new File([stored.bytes], ref.originalName, { type: ref.mimeType });
    },
    async readAssetBytes(assetId: string) {
      const stored = fakes.assets.get(assetId);
      if (!stored) {
        throw new Error(`Missing asset ${assetId}`);
      }
      return stored.bytes;
    },
    async persistAssetBytes(bytes: Uint8Array, ref: AssetRef) {
      fakes.assets.set(ref.assetId, { ref, bytes: new Uint8Array(bytes) });
      return ref;
    },
    ensureUploadedFileAssets: async (file: unknown) => file,
    deleteOrphanAssets: async () => undefined
  })
);

vi.mock(
  '$lib/features/project-management/services/persistence.service',
  () => ({
    saveProject: async () => undefined,
    loadSerializedProject: async () => null,
    removeProject: async () => undefined
  })
);

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    async query(sql: string) {
      const tableLookup = sql.match(/WHERE table_name = '([^']+)'/);
      if (tableLookup) {
        return fakes.duckTables.has(tableLookup[1])
          ? [{ table_name: tableLookup[1] }]
          : [];
      }
      const attributeSelect = sql.match(
        /FROM custom_basemap_attributes WHERE basemap IN \((.*)\)/
      );
      if (attributeSelect) {
        const ids = attributeSelect[1]
          .split(',')
          .map((id) => id.trim().replace(/^'|'$/g, ''));
        return fakes.attributeRows.filter((row) =>
          ids.includes(String(row.basemap))
        );
      }
      if (sql.startsWith('DELETE FROM custom_basemap_attributes')) {
        fakes.attributeRows.length = 0;
      }
      return [];
    }
  },
  duckDBOrchestrator: {
    waitForInitialization: async () => undefined,
    getDatasetBySourceFile: () => undefined
  }
}));

vi.mock('$lib/features/map/services', async () => {
  const { basemapCatalogService } = await vi.importActual<
    typeof import('$lib/features/map/services/basemap-catalog.service.svelte')
  >('$lib/features/map/services/basemap-catalog.service.svelte');
  return {
    basemapCatalogService,
    basemapService: { registerCustomBasemap: fakes.registerCustomBasemap },
    processBasemapImport: fakes.processBasemapImport,
    isImportedCustomBasemap: (basemap: BasemapMetadata) =>
      basemap.isCustom === true &&
      !basemap.isDatasetGeometry &&
      basemap.file.startsWith('custom_basemap_')
  };
});

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    get referenceBasemapId() {
      return fakes.referenceBasemap.id;
    }
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showWarning: fakes.showWarning,
  showError: vi.fn()
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: { selectedDataset: null, datasets: [] }
}));

vi.mock('$lib/features/commons/stores/data-tab.store.svelte', () => ({
  dataTabState: {
    basemapJoin: { selectedBasemap: null },
    geolocation: {
      latitudeColumn: null,
      longitudeColumn: null,
      linkedVariableName: ''
    }
  }
}));

const { basemapCatalogService } =
  await import('$lib/features/map/services/basemap-catalog.service.svelte');
const { persistCustomBasemapSource } =
  await import('$lib/features/project-management/services/custom-basemap-source.service');
const { restoreCustomBasemapTables } =
  await import('$lib/features/project-management/services/custom-basemap-restore.service');
const { deserialize } =
  await import('$lib/features/project-management/services/serializer.service');
const { createArchive } =
  await import('$lib/features/project-management/io/exporter');
const { importProject } =
  await import('$lib/features/project-management/io/importer');
const { migrateIfNeeded } =
  await import('$lib/features/project-management/core/schema-migration');

const SOURCE_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Zone A' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0]
          ]
        ]
      }
    }
  ]
});

function customBasemap(
  file: string,
  overrides: Partial<BasemapMetadata> = {}
): BasemapMetadata {
  return {
    file,
    title_fr: `Titre ${file}`,
    title_en: `Title ${file}`,
    source: 'Import',
    date: '2026',
    bbox: [0, 0, 1, 1],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'identity' },
    layers: [],
    isCustom: true,
    ...overrides
  };
}

function projectWith(data: Record<string, unknown>) {
  return {
    id: 'project-a',
    manifest: {
      version: PROJECT_CONST.SCHEMA_VERSION,
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
      name: 'Imported basemap project',
      format: 'kh' as const
    },
    data: { sourceFiles: [], ...data }
  };
}

function simulateBrowserReload(): void {
  fakes.duckTables.clear();
  fakes.attributeRows.length = 0;
  basemapCatalogService.replaceCustomBasemaps([]);
}

beforeEach(() => {
  fakes.assets.clear();
  simulateBrowserReload();
  fakes.processBasemapImport.mockReset();
  fakes.processBasemapImport.mockImplementation(
    async (_file: File, options: { tableName?: string }) => {
      fakes.duckTables.add(options.tableName ?? 'custom_basemap_new');
      return {
        basemap: undefined,
        tableName: options.tableName,
        geometryTable: { rebuiltTable: options.tableName }
      };
    }
  );
  fakes.registerCustomBasemap.mockReset();
  fakes.referenceBasemap.id = null;
  fakes.showWarning.mockReset();
});

describe('imported custom basemap persistence', () => {
  it('replays the archived source under the same table after a .kh round-trip', async () => {
    const tableName = 'custom_basemap_1790000000000';
    const sourceFile = new File([SOURCE_GEOJSON], 'zones.geojson', {
      type: 'application/geo+json'
    });
    const imported = await persistCustomBasemapSource(
      customBasemap(tableName),
      sourceFile
    );
    basemapCatalogService.addCustomBasemap(imported);
    fakes.duckTables.add(tableName);
    fakes.duckTables.add('custom_basemap_attributes');
    fakes.attributeRows.push({
      raw: 'Zone A',
      id: '0',
      variant: 'name',
      normalized: 'zonea',
      basemap: tableName,
      basemap_count: 1
    });

    const archive = await createArchive(projectWith({}) as never);

    fakes.assets.clear();
    simulateBrowserReload();

    const reopened = await importProject(
      new File([await archive.arrayBuffer()], 'project.kh')
    );
    await restoreCustomBasemapTables();

    const restoredMetadata = basemapCatalogService.getBasemapById(tableName);
    expect(restoredMetadata?.sourceAsset?.assetId).toBe(
      imported.sourceAsset?.assetId
    );
    expect(
      (reopened.data as { customBasemaps?: { attributes: unknown[] } })
        .customBasemaps?.attributes
    ).toHaveLength(1);
    expect(fakes.processBasemapImport).toHaveBeenCalledTimes(1);
    const [replayedFile, replayOptions] =
      fakes.processBasemapImport.mock.calls[0];
    expect(replayOptions).toEqual({ tableName });
    expect((replayedFile as File).name).toBe('zones.geojson');
    expect(await (replayedFile as File).text()).toBe(SOURCE_GEOJSON);
    expect(fakes.showWarning).not.toHaveBeenCalled();
  });

  it('warns once, by name, for imported basemaps it cannot rebuild', async () => {
    const replayable = await persistCustomBasemapSource(
      customBasemap('custom_basemap_1'),
      new File([SOURCE_GEOJSON], 'ok.geojson')
    );
    fakes.processBasemapImport.mockRejectedValueOnce(new Error('WASM OOM'));
    basemapCatalogService.replaceCustomBasemaps([
      replayable,
      customBasemap('custom_basemap_legacy'),
      customBasemap('dataset_table', { isDatasetGeometry: true }),
      customBasemap('osm_openstreetmap_1')
    ]);

    await restoreCustomBasemapTables();

    expect(fakes.processBasemapImport).toHaveBeenCalledTimes(1);
    expect(fakes.showWarning).toHaveBeenCalledTimes(1);
    const message = String(fakes.showWarning.mock.calls[0][1]);
    expect(message).toContain('custom_basemap_1');
    expect(message).toContain('custom_basemap_legacy');
    expect(message).not.toContain('dataset_table');
    expect(message).not.toContain('osm_openstreetmap_1');
  });

  it('hands the rebuilt reference basemap to the map, which may already have failed to load it', async () => {
    const reference = await persistCustomBasemapSource(
      customBasemap('custom_basemap_reference'),
      new File([SOURCE_GEOJSON], 'reference.geojson')
    );
    const other = await persistCustomBasemapSource(
      customBasemap('custom_basemap_other_layer'),
      new File([SOURCE_GEOJSON], 'other.geojson')
    );
    basemapCatalogService.replaceCustomBasemaps([reference, other]);
    fakes.referenceBasemap.id = reference.file;

    await restoreCustomBasemapTables();

    expect(fakes.processBasemapImport).toHaveBeenCalledTimes(2);
    expect(fakes.registerCustomBasemap).toHaveBeenCalledTimes(1);
    expect(fakes.registerCustomBasemap).toHaveBeenCalledWith(reference, {
      rebuiltTable: reference.file
    });
  });

  it('does not rebuild a basemap whose table is still in the session', async () => {
    const basemap = await persistCustomBasemapSource(
      customBasemap('custom_basemap_2'),
      new File([SOURCE_GEOJSON], 'kept.geojson')
    );
    basemapCatalogService.replaceCustomBasemaps([basemap]);
    fakes.duckTables.add(basemap.file);

    await restoreCustomBasemapTables();

    expect(fakes.processBasemapImport).not.toHaveBeenCalled();
  });

  it('does not carry another project basemap, or its source file, into the next project', async () => {
    const otherProjectBasemap = await persistCustomBasemapSource(
      customBasemap('custom_basemap_other'),
      new File([SOURCE_GEOJSON], 'private.geojson')
    );
    basemapCatalogService.addCustomBasemap(otherProjectBasemap);
    fakes.duckTables.add('custom_basemap_attributes');

    await deserialize({
      id: 'project-b',
      manifest: {
        version: PROJECT_CONST.SCHEMA_VERSION,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
        name: 'Project without custom basemap',
        format: 'kh'
      },
      data: { sourceFiles: [] }
    } as never);

    expect(
      basemapCatalogService.getBasemapById('custom_basemap_other')
    ).toBeNull();

    const archive = await createArchive(projectWith({}) as never);
    const { unzipSync } = await import('fflate');
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const manifest = JSON.parse(
      new TextDecoder().decode(entries['manifest.json'])
    ) as { assetCount: number };
    expect(manifest.assetCount).toBe(0);
  });

  it('keeps restored custom basemaps when the catalog finishes loading afterwards', async () => {
    const basemap = customBasemap('custom_basemap_3');
    basemapCatalogService.replaceCustomBasemaps([basemap]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }))
    );

    try {
      await basemapCatalogService.loadCatalog();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(basemapCatalogService.getBasemapById(basemap.file)).toEqual(basemap);
  });
});

describe('project schema 3.10.0 migration', () => {
  it('opens a 3.9.0 project as 3.10.0 without mutating the stored snapshot', () => {
    const legacy = {
      id: 'legacy',
      manifest: { version: '3.9.0', name: 'Legacy project' },
      data: {
        customBasemaps: {
          metadata: [customBasemap('custom_basemap_legacy')],
          attributes: []
        }
      }
    };

    const migrated = migrateIfNeeded(legacy);

    expect(migrated.manifest).toEqual({
      version: '3.10.0',
      name: 'Legacy project'
    });
    expect(migrated.data).toEqual(legacy.data);
    expect(legacy.manifest.version).toBe('3.9.0');
  });
});
