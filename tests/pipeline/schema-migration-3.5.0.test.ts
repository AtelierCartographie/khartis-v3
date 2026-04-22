import { describe, expect, it } from 'vitest';
import { migrateIfNeeded } from '$lib/features/project-management/core/schema-migration';
import { PROJECT_CONST } from '$lib/features/project-management/constants';

function buildV340Project(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    manifest: { version: '3.4.0' },
    visualizations: [
      {
        id: 'viz-1',
        type: 'proportional',
        symbol: {
          enabled: true,
          mode: 'proportional',
          shape: 'circle',
          size: 10,
          minSize: 1,
          maxSize: 24,
          sizeScale: 'linear',
          opacity: 1,
          fillMode: 'unique',
          fillColor: '#2171b5',
          fillColorB: '#ff832b',
          strokeMode: 'unique',
          strokeColor: '#1e3a5f',
          strokeWidth: 1,
          strokeOpacity: 1,
          proportionalType: 'doubles',
          categoryShape: 'unique',
          valueColumn: 'colB',
          sizeColumn: 'colA',
          ...(overrides.symbol ?? {})
        }
      }
    ],
    ...overrides
  };
}

describe('schema-migration 3.4.0 → 3.5.0', () => {
  it('backfills commonScale, positionMode and breakValue A/B on symbol configs', () => {
    const migrated = migrateIfNeeded(buildV340Project());
    const manifest = migrated.manifest as { version?: string };
    expect(manifest.version).toBe(PROJECT_CONST.APP_VERSION);

    const vizList = migrated.visualizations as Array<{
      symbol: Record<string, unknown>;
    }>;
    const symbol = vizList[0].symbol;
    expect(symbol.commonScale).toBe(true);
    expect(symbol.positionMode).toBe('overlay');
    expect(symbol.breakValueA).toBeNull();
    expect(symbol.breakValueB).toBeNull();
  });

  it('preserves existing values when 3.4.0 already has them set', () => {
    const migrated = migrateIfNeeded(
      buildV340Project({
        symbol: {
          enabled: true,
          mode: 'proportional',
          commonScale: false,
          positionMode: 'juxtaposition',
          breakValueA: 42,
          breakValueB: -12,
          proportionalType: 'doubles'
        }
      })
    );

    const vizList = migrated.visualizations as Array<{
      symbol: Record<string, unknown>;
    }>;
    const symbol = vizList[0].symbol;
    expect(symbol.commonScale).toBe(false);
    expect(symbol.positionMode).toBe('juxtaposition');
    expect(symbol.breakValueA).toBe(42);
    expect(symbol.breakValueB).toBe(-12);
  });

  it('is idempotent when applied to a 3.5.0 project', () => {
    const first = migrateIfNeeded(buildV340Project());
    const second = migrateIfNeeded(first);
    expect(second).toEqual(first);
  });

  it('does not alter projects that have no symbol primitive', () => {
    const migrated = migrateIfNeeded({
      manifest: { version: '3.4.0' },
      visualizations: [
        {
          id: 'viz-only-polygon',
          type: 'choropleth',
          polygon: { enabled: true, fillMode: 'unique', fillColor: '#abc' }
        }
      ]
    });
    const vizList = migrated.visualizations as Array<Record<string, unknown>>;
    expect(vizList[0].symbol).toBeUndefined();
  });
});
