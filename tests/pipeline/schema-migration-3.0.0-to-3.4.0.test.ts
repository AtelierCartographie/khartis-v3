import { describe, expect, it } from 'vitest';
import { migrateIfNeeded } from '$lib/features/project-management/core/schema-migration';
import { PROJECT_CONST } from '$lib/features/project-management/constants';

function buildV300Project(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    manifest: { version: '3.0.0' },
    visualizations: [
      {
        id: 'viz-1',
        symbols: { type: 'point', size: 10 },
        style: { fillColor: '#ff0000' }
      }
    ],
    ...overrides
  };
}

function buildV320Project(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    manifest: { version: '3.2.0' },
    visualizations: [
      {
        id: 'viz-1',
        style: { fillColor: '#00ff00' }
      }
    ],
    ...overrides
  };
}

function buildV330Project(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    manifest: { version: '3.3.0' },
    visualizations: [
      {
        id: 'viz-1',
        modes: { fill: 'unique', stroke: 'unique' },
        style: {
          fillColor: '#0000ff',
          fillOpacity: 0.8,
          strokeColor: '#111111',
          strokeOpacity: 0.9,
          strokeWidth: 2,
          lineColor: '#222222',
          lineOpacity: 0.7,
          lineWidth: 3,
          textColor: '#333333',
          textOpacity: 0.6,
          textSize: 14
        },
        mapping: {
          fillColumn: 'colA',
          strokeColumn: 'colB'
        },
        primitiveFilters: ['point', 'line', 'polygon']
      }
    ],
    ...overrides
  };
}

describe('schema-migration 3.0.0 → 3.2.0 (remapLegacyPointShape)', () => {
  it('remaps symbols.type from point to circle', () => {
    const migrated = migrateIfNeeded(buildV300Project());
    const manifest = migrated.manifest as { version?: string };
    expect(manifest.version).toBe(PROJECT_CONST.SCHEMA_VERSION);

    const vizList = migrated.visualizations as Array<{
      symbols: Record<string, unknown>;
    }>;
    expect(vizList[0].symbols.type).toBe('circle');
    expect(vizList[0].symbols.size).toBe(10);
  });

  it('does not alter existing circle types', () => {
    const migrated = migrateIfNeeded(
      buildV300Project({
        visualizations: [{ id: 'viz-1', symbols: { type: 'circle', size: 5 } }]
      })
    );
    const vizList = migrated.visualizations as Array<{
      symbols: Record<string, unknown>;
    }>;
    expect(vizList[0].symbols.type).toBe('circle');
  });

  it('remaps nested symbols recursively', () => {
    const migrated = migrateIfNeeded(
      buildV300Project({
        visualizations: [
          {
            id: 'viz-1',
            nested: {
              symbols: { type: 'point', color: '#fff' }
            }
          }
        ]
      })
    );
    const vizList = migrated.visualizations as Array<{
      nested: { symbols: Record<string, unknown> };
    }>;
    expect(vizList[0].nested.symbols.type).toBe('circle');
  });
});

describe('schema-migration 3.2.0 → 3.3.0 (backfillSymbolFillColor)', () => {
  it('copies style.fillColor into style.symbolFillColor when missing', () => {
    const migrated = migrateIfNeeded(buildV320Project());
    const vizList = migrated.visualizations as Array<{
      style: Record<string, unknown>;
    }>;
    expect(vizList[0].style.symbolFillColor).toBe('#00ff00');
    expect(vizList[0].style.fillColor).toBe('#00ff00');
  });

  it('preserves existing symbolFillColor', () => {
    const migrated = migrateIfNeeded(
      buildV320Project({
        visualizations: [
          {
            id: 'viz-1',
            style: { fillColor: '#00ff00', symbolFillColor: '#abc' }
          }
        ]
      })
    );
    const vizList = migrated.visualizations as Array<{
      style: Record<string, unknown>;
    }>;
    expect(vizList[0].style.symbolFillColor).toBe('#abc');
  });

  it('does nothing when fillColor is absent', () => {
    const migrated = migrateIfNeeded(
      buildV320Project({
        visualizations: [{ id: 'viz-1', style: { strokeColor: '#000' } }]
      })
    );
    const vizList = migrated.visualizations as Array<{
      style: Record<string, unknown>;
    }>;
    expect(vizList[0].style.symbolFillColor).toBeUndefined();
  });
});

describe('schema-migration 3.3.0 → 3.4.0 (backfillPrimitiveConfigs)', () => {
  it('backfills polygon, line, text and symbol primitives', () => {
    const migrated = migrateIfNeeded(buildV330Project());
    const vizList = migrated.visualizations as Array<Record<string, unknown>>;
    const viz = vizList[0];

    expect(viz.polygon).toMatchObject({
      enabled: true,
      fillMode: 'unique',
      fillColor: '#0000ff',
      fillOpacity: 0.8,
      strokeMode: 'unique',
      strokeColor: '#111111',
      strokeOpacity: 0.9,
      strokeWidth: 2
    });

    expect(viz.line).toMatchObject({
      enabled: true,
      colorMode: 'unique',
      color: '#222222',
      opacity: 0.7,
      width: 3
    });

    expect(viz.text).toMatchObject({
      enabled: true,
      color: '#333333',
      opacity: 0.6,
      size: 14
    });

    expect(viz.symbol).toMatchObject({
      enabled: true,
      fillMode: 'unique',
      fillColor: '#0000ff',
      strokeMode: 'unique',
      strokeColor: '#111111',
      strokeOpacity: 0.9,
      strokeWidth: 2,
      size: 10,
      opacity: 0.8
    });
  });

  it('disables primitives not in primitiveFilters', () => {
    const migrated = migrateIfNeeded(
      buildV330Project({
        visualizations: [
          {
            id: 'viz-1',
            modes: { fill: 'unique' },
            style: { fillColor: '#0000ff' },
            mapping: { fillColumn: 'colA' },
            primitiveFilters: ['polygon']
          }
        ]
      })
    );
    const vizList = migrated.visualizations as Array<Record<string, unknown>>;
    const viz = vizList[0];

    expect((viz.polygon as Record<string, unknown>).enabled).toBe(true);
    expect((viz.line as Record<string, unknown>).enabled).toBe(false);
    expect((viz.text as Record<string, unknown>).enabled).toBe(false);
    expect((viz.symbol as Record<string, unknown>).enabled).toBe(false);
  });

  it('is idempotent when applied to a 3.4.0 project', () => {
    const first = migrateIfNeeded(buildV330Project());
    const second = migrateIfNeeded(first);
    expect(second).toEqual(first);
  });
});
