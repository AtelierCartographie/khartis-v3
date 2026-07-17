import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { DatasetResult } from '$lib/features/data-pipeline/types';

const { processFileInternalMock } = vi.hoisted(() => ({
  processFileInternalMock: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/file-processor', () => ({
  processFileInternal: processFileInternalMock
}));

import { processZipFile } from '$lib/features/data-pipeline/processors/zip-processor';
import {
  extractZip,
  getShapefileBundlesFromArchive
} from '$lib/features/data-pipeline/utils/zip-handler';

const TWO_SHAPEFILES_FIXTURE = path.resolve(
  __dirname,
  '../../tests-datasets/zip/two-shapefiles.zip'
);

async function loadFixtureZip(): Promise<File> {
  const buffer = await fs.readFile(TWO_SHAPEFILES_FIXTURE);
  return new File([new Uint8Array(buffer)], 'two-shapefiles.zip', {
    type: 'application/zip'
  });
}

function makeZip(entries: Record<string, string>): File {
  const normalized: Record<string, Uint8Array> = {};
  for (const [entryPath, value] of Object.entries(entries)) {
    normalized[entryPath] = strToU8(value);
  }
  return new File([Uint8Array.from(zipSync(normalized))], 'bundle.zip', {
    type: 'application/zip'
  });
}

function stubDataset(name: string): DatasetResult {
  return {
    id: `ds-${name}`,
    tableName: `table_${name}`,
    columns: [],
    rowCount: 1,
    name,
    sourceFileId: name,
    format: 'shapefile',
    metadata: {
      processedAt: new Date(),
      fileType: 'shapefile',
      parserUsed: 'DuckDB'
    }
  };
}

describe('getShapefileBundlesFromArchive', () => {
  it('groups shapefile members by basename into one bundle per .shp', async () => {
    const extraction = await extractZip(await loadFixtureZip());

    expect(extraction.isShapefileArchive).toBe(false);

    const bundles = getShapefileBundlesFromArchive(extraction.files);
    expect(bundles.map((bundle) => bundle.baseName).sort()).toEqual([
      'cities-points',
      'rivers-lines'
    ]);

    for (const bundle of bundles) {
      const companionExtensions = bundle.companions
        .map((f) => f.name.slice(f.name.lastIndexOf('.')))
        .sort();
      expect(companionExtensions).toEqual(['.dbf', '.prj', '.shx']);
    }
  });
});

describe('processZipFile — multi-shapefile archives (F8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processFileInternalMock.mockImplementation(
      async (file: File, options?: { originalName?: string }) =>
        stubDataset(options?.originalName ?? file.name)
    );
  });

  it('imports a 100% multi-shapefile ZIP as N datasets instead of failing', async () => {
    const result = await processZipFile(await loadFixtureZip());

    expect('datasets' in result).toBe(true);
    if (!('datasets' in result)) return;

    expect(result.datasets).toHaveLength(2);
    expect(result.processedFiles).toBe(2);
    expect(result.totalFiles).toBe(2);
    expect(result.skippedFiles).toEqual([]);
    expect(result.datasets.map((dataset) => dataset.name).sort()).toEqual([
      'cities-points',
      'rivers-lines'
    ]);
    expect(
      result.datasets.every(
        (dataset) => dataset.sourceFileId === 'two-shapefiles.zip'
      )
    ).toBe(true);

    for (const [shpFile, options] of processFileInternalMock.mock.calls as [
      File,
      { originalName?: string; companionFiles?: File[] }
    ][]) {
      expect(shpFile.name.endsWith('.shp')).toBe(true);
      const companionNames = (options.companionFiles ?? []).map((f) => f.name);
      expect(companionNames).toHaveLength(3);
      const base = shpFile.name.replace(/\.shp$/, '');
      expect(companionNames.sort()).toEqual([
        `${base}.dbf`,
        `${base}.prj`,
        `${base}.shx`
      ]);
    }
  });

  it('mixes shapefile bundles and standalone supported files into one result', async () => {
    const zip = makeZip({
      'roads.shp': 'shp',
      'roads.shx': 'shx',
      'roads.dbf': 'dbf',
      'stations.shp': 'shp',
      'stations.shx': 'shx',
      'stations.dbf': 'dbf',
      'attributes.csv': 'a;b\n1;2'
    });

    const result = await processZipFile(zip);

    expect('datasets' in result).toBe(true);
    if (!('datasets' in result)) return;

    expect(result.totalFiles).toBe(3);
    expect(result.datasets).toHaveLength(3);
    expect(result.datasets.map((dataset) => dataset.name).sort()).toEqual([
      'attributes.csv',
      'roads',
      'stations'
    ]);
  });

  it('keeps processing remaining bundles when one shapefile fails', async () => {
    processFileInternalMock.mockImplementation(
      async (file: File, options?: { originalName?: string }) => {
        if (file.name === 'cities-points.shp') {
          throw new Error('broken shapefile');
        }
        return stubDataset(options?.originalName ?? file.name);
      }
    );

    const result = await processZipFile(await loadFixtureZip());

    expect('datasets' in result).toBe(true);
    if (!('datasets' in result)) return;

    expect(result.datasets).toHaveLength(1);
    expect(result.skippedFiles).toEqual(['cities-points.shp']);
  });
});
