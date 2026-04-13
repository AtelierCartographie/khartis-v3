import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ExampleFeatureCollection = {
  type: string;
  features: Array<{
    geometry?: {
      type?: string;
    };
    properties?: Record<string, unknown>;
  }>;
};

describe('examples data fixtures', () => {
  it('uses real line geometries for the transport flows example', () => {
    const fixturePath = resolve(
      process.cwd(),
      'static/examples/data/transport-flows.geojson'
    );
    const rawFixture = readFileSync(fixturePath, 'utf8');
    const fixture = JSON.parse(rawFixture) as ExampleFeatureCollection;

    expect(fixture.type).toBe('FeatureCollection');
    expect(fixture.features.length).toBeGreaterThan(0);
    expect(
      fixture.features.every((feature) =>
        ['LineString', 'MultiLineString'].includes(feature.geometry?.type ?? '')
      )
    ).toBe(true);
    expect(
      fixture.features.every(
        (feature) => typeof feature.properties?.volume === 'number'
      )
    ).toBe(true);
  });
});
