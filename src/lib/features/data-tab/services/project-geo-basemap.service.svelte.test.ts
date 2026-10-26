import { describe, expect, it } from 'vitest';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import {
  mergeProjectGeoSuggestions,
  type ScoredBasemap
} from './project-geo-basemap.service';

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

function scored(
  file: string,
  score: number,
  matchesData = true
): ScoredBasemap {
  return { basemap: basemap(file), score, matchesData };
}

function files(suggestions: ScoredBasemap[]): string[] {
  return suggestions.map((suggestion) => suggestion.basemap.file);
}

describe('mergeProjectGeoSuggestions', () => {
  it('should rank a project file first when it ties with a catalog basemap', () => {
    const merged = mergeProjectGeoSuggestions(
      [scored('world', 100), scored('europe', 40)],
      [scored('project', 100)],
      3
    );

    expect(files(merged)).toEqual(['project', 'world', 'europe']);
  });

  it('should rank a data match above a higher score from metadata alone', () => {
    const merged = mergeProjectGeoSuggestions(
      [scored('world', 30, false)],
      [scored('project', 20)],
      3
    );

    expect(files(merged)).toEqual(['project', 'world']);
  });

  it('should drop a project file that matches nothing and keep the limit', () => {
    const merged = mergeProjectGeoSuggestions(
      [scored('a', 30), scored('b', 20), scored('c', 10)],
      [scored('unmatched', 0), scored('project', 25)],
      3
    );

    expect(files(merged)).toEqual(['a', 'project', 'b']);
  });
});
