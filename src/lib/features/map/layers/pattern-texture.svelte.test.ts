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

  it('reuses the palette atlas for identical class patterns and keys tiles c0..cN', async () => {
    const { getPatternPaletteAtlas } = await importPatternTexture();
    const patterns = [
      {
        type: 'line',
        angle: 45,
        scale: 3,
        size: 4,
        fill: '#000000',
        patchSize: false
      },
      {
        type: 'line',
        angle: 45,
        scale: 3,
        size: 9,
        fill: '#000000',
        patchSize: false
      },
      {
        type: 'line',
        angle: 45,
        scale: 3,
        size: 14,
        fill: '#000000',
        patchSize: false
      }
    ];

    const first = getPatternPaletteAtlas(patterns);
    const second = getPatternPaletteAtlas([...patterns]);

    expect(Object.keys(first.mapping)).toEqual(['c0', 'c1', 'c2']);
    expect(second.atlas).toBe(first.atlas);
    expect(second.mapping).toBe(first.mapping);
    expect(motifAtlasMock).toHaveBeenCalledTimes(1);
    expect(motifAtlasMock).toHaveBeenCalledWith({
      c0: expect.objectContaining({
        type: 'line',
        size: 4,
        fill: '#000000',
        background: 'transparent',
        patchSize: false
      }),
      c1: expect.objectContaining({ size: 9 }),
      c2: expect.objectContaining({ size: 14 })
    });
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
