import { describe, expect, it } from 'vitest';
import { migrateIfNeeded } from '$lib/features/project-management/core/schema-migration';
import { PROJECT_CONST } from '$lib/features/project-management/constants';

function buildV360Project(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    manifest: { version: '3.6.0' },
    visualizations: [
      {
        id: 'viz-1',
        symbol: {
          size: 80,
          maxSize: 90,
          minSize: 60,
          strokeWidth: 18
        },
        polygon: {
          strokeWidth: 16
        },
        line: {
          width: 18,
          maxWidth: 40
        },
        text: {
          haloWidth: 9,
          secondaryLabels: {
            haloWidth: 8
          }
        },
        style: {
          strokeWidth: 14,
          lineWidth: 14,
          lineMaxWidth: 35,
          textHaloWidth: 9,
          labelHaloWidth: 9
        }
      }
    ],
    ...overrides
  };
}

describe('schema-migration 3.6.0 → 3.7.0', () => {
  it('should clamp legacy slider values to the new cartographic bounds', () => {
    const migrated = migrateIfNeeded(buildV360Project());

    const manifest = migrated.manifest as { version?: string };
    expect(manifest.version).toBe(PROJECT_CONST.APP_VERSION);

    const viz = (migrated.visualizations as Array<Record<string, unknown>>)[0];
    const symbol = viz.symbol as Record<string, number>;
    const polygon = viz.polygon as Record<string, number>;
    const line = viz.line as Record<string, number>;
    const text = viz.text as Record<string, unknown>;
    const secondaryLabels = text.secondaryLabels as Record<string, number>;
    const style = viz.style as Record<string, number>;

    expect(symbol.size).toBe(50);
    expect(symbol.maxSize).toBe(60);
    expect(symbol.minSize).toBe(50);
    expect(symbol.strokeWidth).toBe(12);
    expect(polygon.strokeWidth).toBe(12);
    expect(line.width).toBe(12);
    expect(line.maxWidth).toBe(20);
    expect(text.haloWidth).toBe(6);
    expect(secondaryLabels.haloWidth).toBe(6);
    expect(style.strokeWidth).toBe(12);
    expect(style.lineWidth).toBe(12);
    expect(style.lineMaxWidth).toBe(20);
    expect(style.textHaloWidth).toBe(6);
    expect(style.labelHaloWidth).toBe(6);
  });

  it('should preserve in-bounds values unchanged', () => {
    const migrated = migrateIfNeeded(
      buildV360Project({
        visualizations: [
          {
            id: 'viz-1',
            symbol: { size: 24, maxSize: 30 },
            line: { width: 4, maxWidth: 12 },
            text: { haloWidth: 2 }
          }
        ]
      })
    );

    const viz = (migrated.visualizations as Array<Record<string, unknown>>)[0];
    const symbol = viz.symbol as Record<string, number>;
    const line = viz.line as Record<string, number>;
    const text = viz.text as Record<string, number>;

    expect(symbol.size).toBe(24);
    expect(symbol.maxSize).toBe(30);
    expect(line.width).toBe(4);
    expect(line.maxWidth).toBe(12);
    expect(text.haloWidth).toBe(2);
  });

  it('should leave non-numeric or missing fields untouched', () => {
    const migrated = migrateIfNeeded(
      buildV360Project({
        visualizations: [
          {
            id: 'viz-1',
            symbol: { shape: 'circle', size: undefined },
            line: { dashed: true },
            text: {}
          }
        ]
      })
    );

    const viz = (migrated.visualizations as Array<Record<string, unknown>>)[0];
    const symbol = viz.symbol as Record<string, unknown>;
    const line = viz.line as Record<string, unknown>;

    expect(symbol.shape).toBe('circle');
    expect(symbol.size).toBeUndefined();
    expect(line.dashed).toBe(true);
  });
});
