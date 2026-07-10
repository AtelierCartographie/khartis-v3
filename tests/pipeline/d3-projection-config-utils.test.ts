import { describe, expect, it } from 'vitest';
import type { D3Usage } from '@ateliercartographie/proj-suggest';

import { buildD3ProjectionFromConfig } from '$lib/features/commons/utils/d3-projection-config.utils';

describe('buildD3ProjectionFromConfig', () => {
  it('should return null when the projection factory name is unknown', () => {
    const config: D3Usage = { projection: 'geoNotARealProjection' };
    expect(buildD3ProjectionFromConfig(config)).toBeNull();
  });

  it('should build a finite projection for geoMercator with no extra params', () => {
    const projection = buildD3ProjectionFromConfig({
      projection: 'geoMercator'
    });
    expect(projection).not.toBeNull();
    const point = projection?.([2.3, 48.8]);
    expect(point).toBeDefined();
    expect(point?.every(Number.isFinite)).toBe(true);
  });

  it('should build Aitoff from the shared d3 projection registry', () => {
    const projection = buildD3ProjectionFromConfig({
      projection: 'geoAitoff'
    });
    expect(projection).not.toBeNull();
    expect(projection?.([2.3, 48.8])?.every(Number.isFinite)).toBe(true);
  });

  it('should apply rotate and default gamma to 0 when only [lambda, phi] is given', () => {
    const projection = buildD3ProjectionFromConfig({
      projection: 'geoMercator',
      rotate: [10, 20]
    });
    expect(projection?.rotate()).toEqual([10, 20, 0]);
  });

  it('should apply center', () => {
    const projection = buildD3ProjectionFromConfig({
      projection: 'geoMercator',
      center: [5, 45]
    });
    const center = projection?.center();
    expect(center?.[0]).toBeCloseTo(5);
    expect(center?.[1]).toBeCloseTo(45);
  });

  it('should apply parallels on a conic projection that exposes parallels()', () => {
    const projection = buildD3ProjectionFromConfig({
      projection: 'geoConicConformal',
      parallels: [44, 49]
    });
    expect(
      (
        projection as unknown as { parallels: () => [number, number] }
      ).parallels()
    ).toEqual([44, 49]);
  });

  it('should ignore parallels on a non-conic projection without parallels()', () => {
    const projection = buildD3ProjectionFromConfig({
      projection: 'geoMercator',
      parallels: [44, 49]
    });
    expect(projection).not.toBeNull();
    expect('parallels' in (projection as object)).toBe(false);
  });
});
