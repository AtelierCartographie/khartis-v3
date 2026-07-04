import { beforeEach, describe, expect, it, vi } from 'vitest';

const { motifAtlasMock } = vi.hoisted(() => ({
  motifAtlasMock: vi.fn((configs: Record<string, unknown>) => ({
    canvas: document.createElement('canvas'),
    mapping: Object.fromEntries(
      Object.keys(configs).map((patternId, index) => [
        patternId,
        { x: index * 16, y: 0, width: 16, height: 16 }
      ])
    )
  }))
}));

vi.mock('@ateliercartographie/motif.js', () => ({
  motifAtlas: motifAtlasMock
}));

async function importPatternTexture() {
  vi.resetModules();
  return import('./pattern-texture');
}

describe('pattern texture atlas cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses custom pattern atlases for identical params', async () => {
    const { getPatternAtlasForPattern } = await importPatternTexture();

    const first = getPatternAtlasForPattern('diagonal', {
      angle: 45,
      size: 4,
      scale: 8
    });
    const second = getPatternAtlasForPattern('diagonal', {
      angle: 45,
      size: 4,
      scale: 8
    });

    expect(second.atlas).toBe(first.atlas);
    expect(second.mapping).toBe(first.mapping);
    expect(motifAtlasMock).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used custom atlas after the cache limit', async () => {
    const { CUSTOM_PATTERN_ATLAS_CACHE_LIMIT, getPatternAtlasForPattern } =
      await importPatternTexture();

    for (let size = 1; size <= CUSTOM_PATTERN_ATLAS_CACHE_LIMIT; size += 1) {
      getPatternAtlasForPattern('diagonal', {
        angle: 45,
        size,
        scale: 8
      });
    }
    expect(motifAtlasMock).toHaveBeenCalledTimes(
      CUSTOM_PATTERN_ATLAS_CACHE_LIMIT
    );

    const refreshed = getPatternAtlasForPattern('diagonal', {
      angle: 45,
      size: 1,
      scale: 8
    });
    expect(motifAtlasMock).toHaveBeenCalledTimes(
      CUSTOM_PATTERN_ATLAS_CACHE_LIMIT
    );

    getPatternAtlasForPattern('diagonal', {
      angle: 45,
      size: CUSTOM_PATTERN_ATLAS_CACHE_LIMIT + 1,
      scale: 8
    });
    expect(motifAtlasMock).toHaveBeenCalledTimes(
      CUSTOM_PATTERN_ATLAS_CACHE_LIMIT + 1
    );

    const stillCached = getPatternAtlasForPattern('diagonal', {
      angle: 45,
      size: 1,
      scale: 8
    });
    expect(stillCached.atlas).toBe(refreshed.atlas);
    expect(motifAtlasMock).toHaveBeenCalledTimes(
      CUSTOM_PATTERN_ATLAS_CACHE_LIMIT + 1
    );

    getPatternAtlasForPattern('diagonal', {
      angle: 45,
      size: 2,
      scale: 8
    });
    expect(motifAtlasMock).toHaveBeenCalledTimes(
      CUSTOM_PATTERN_ATLAS_CACHE_LIMIT + 2
    );
  });
});
