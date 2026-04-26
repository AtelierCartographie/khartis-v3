import { describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';

const { processFileInternalMock } = vi.hoisted(() => ({
  processFileInternalMock: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/file-processor', () => ({
  processFileInternal: (...args: unknown[]) => processFileInternalMock(...args)
}));

import { processZipFile } from '$lib/features/data-pipeline/processors/zip-processor';

function makeKmz(entries: Record<string, string>): File {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, content]) => [path, strToU8(content)])
    )
  );

  return new File([Uint8Array.from(zipped)], 'places.kmz', {
    type: 'application/vnd.google-earth.kmz'
  });
}

describe('KMZ processing', () => {
  it('extracts the KML payload and processes it through the standard file pipeline', async () => {
    processFileInternalMock.mockResolvedValueOnce({
      id: 'kml-dataset',
      tableName: 'kml_table',
      columns: [],
      rowCount: 1,
      geometry: null,
      name: 'doc.kml',
      sourceFileId: 'doc.kml',
      format: 'kml',
      metadata: {
        processedAt: new Date(),
        fileType: 'kml'
      }
    });

    const result = await processZipFile(
      makeKmz({
        'doc.kml': '<?xml version="1.0"?><kml></kml>'
      })
    );

    expect(processFileInternalMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'doc.kml' }),
      { originalName: 'doc.kml' }
    );
    expect(result).toMatchObject({
      id: 'kml-dataset',
      sourceFileId: 'places.kmz',
      name: 'doc.kml'
    });
  });
});
