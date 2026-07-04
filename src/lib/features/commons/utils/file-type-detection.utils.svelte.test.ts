import { describe, expect, it } from 'vitest';
import { FileType } from '../types/create-project.types';
import { detectFileType } from './file-type-detection.utils';

describe('detectFileType', () => {
  it('detects tabular text files as CSV-compatible input', () => {
    const file = new File(['id,name'], 'data.txt', { type: 'text/plain' });

    expect(detectFileType(file)).toBe(FileType.CSV);
  });

  it('detects GeoJSON from geo+json MIME types', () => {
    const file = new File(['{}'], 'data.bin', {
      type: 'application/geo+json'
    });

    expect(detectFileType(file)).toBe(FileType.GEOJSON);
  });

  it('detects shapefile auxiliary sidecars', () => {
    const file = new File(['sidecar'], 'roads.sbn', {
      type: 'application/octet-stream'
    });

    expect(detectFileType(file)).toBe(FileType.SHAPEFILE);
  });
});
