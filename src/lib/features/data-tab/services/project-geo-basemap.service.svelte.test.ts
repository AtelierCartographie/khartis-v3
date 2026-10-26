import { describe, expect, it } from 'vitest';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { mergeProjectGeoSuggestions } from './project-geo-basemap.service';

function basemap(file: string): BasemapMetadata {
  return {
    file,
    title_fr: file,
    title_en: file,
    source: '',
    date: '',
    proj_source: '',
    proj_to: { type: 'identity' },
    bbox: [0, 0, 0, 0],
    layers: []
  };
}

describe('mergeProjectGeoSuggestions', () => {
  it('should rank a project file first when it ties with a catalog basemap', () => {
    const merged = mergeProjectGeoSuggestions(
      [
        { basemap: basemap('world'), score: 100 },
        { basemap: basemap('europe'), score: 40 }
      ],
      [{ basemap: basemap('project'), score: 100 }],
      3
    );

    expect(merged.map((item) => item.basemap.file)).toEqual([
      'project',
      'world',
      'europe'
    ]);
  });

  it('should list a project file once when the catalog ranking also returns it', () => {
    const merged = mergeProjectGeoSuggestions(
      [
        { basemap: basemap('custom_basemap_1'), score: 60 },
        { basemap: basemap('world'), score: 30 }
      ],
      [{ basemap: basemap('custom_basemap_1'), score: 100 }],
      3
    );

    expect(merged).toEqual([
      { basemap: basemap('custom_basemap_1'), score: 100 },
      { basemap: basemap('world'), score: 30 }
    ]);
  });

  it('should drop a project file that matches nothing and keep the limit', () => {
    const merged = mergeProjectGeoSuggestions(
      [
        { basemap: basemap('a'), score: 30 },
        { basemap: basemap('b'), score: 20 },
        { basemap: basemap('c'), score: 10 }
      ],
      [
        { basemap: basemap('unmatched'), score: 0 },
        { basemap: basemap('project'), score: 25 }
      ],
      3
    );

    expect(merged.map((item) => item.basemap.file)).toEqual([
      'a',
      'project',
      'b'
    ]);
  });
});
