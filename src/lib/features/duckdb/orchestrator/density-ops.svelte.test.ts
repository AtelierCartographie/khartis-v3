import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'density-ops.ts'),
  'utf8'
);

describe('density GPS basemap path', () => {
  it('builds GPS density from spatial joins in DuckDB SQL', () => {
    expect(source).toContain('generateDotDensityFromGpsJoin');
    expect(source).toContain('computeDensityLevelsFromGpsJoin');
    expect(source).toContain('ST_Point(');
    expect(source).toContain('ST_Intersects(g.geom, p.point_geom)');
    expect(source).toContain('TRY_CAST("${escapedLatCol}" AS DOUBLE)');
    expect(source).toContain('TRY_CAST("${escapedLonCol}" AS DOUBLE)');
  });
});
