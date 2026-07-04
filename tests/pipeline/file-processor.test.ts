import { describe, expect, it } from 'vitest';
import {
  createFileFromUpload,
  processFileInternal
} from '$lib/features/data-pipeline/processors/file-processor';

describe('file processor errors', () => {
  it('throws a ParseError for standalone shapefiles', async () => {
    await expect(
      processFileInternal(new File([''], 'roads.shp'))
    ).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'shapefile',
      details: {
        fileName: 'roads.shp'
      }
    });
  });

  it('throws a ParseError when uploaded file content is missing', async () => {
    await expect(
      createFileFromUpload({
        id: 'upload-1',
        name: 'data.csv',
        size: 0,
        type: 'text/csv',
        fileType: 'csv'
      })
    ).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'csv',
      details: {
        fileId: 'upload-1',
        fileName: 'data.csv'
      }
    });
  });
});
