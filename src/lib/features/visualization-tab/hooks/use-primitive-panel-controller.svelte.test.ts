import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-primitive-panel-controller.svelte.ts'),
  'utf8'
);

describe('usePrimitivePanelController', () => {
  it('auto-selects a size column for proportional lines in the shared auto-column helper and skips hidden technical value columns', () => {
    expect(source).toContain(
      'if (primitive === PrimitiveFilterType.LINE && !sizeColumn)'
    );
    expect(source).toContain(
      'line?.thicknessMode === ThicknessMode.PROPORTIONAL'
    );
    expect(source).toContain('!isHiddenTechnicalColumnName(line.valueColumn)');
    expect(source).toContain("line.valueColumn === 'id'");
    expect(source).toContain(
      'findAutoValueColumn([line.categoryColumn, line.valueColumn]) ??'
    );
    expect(source).toContain(
      'findFallbackNumericColumn([line.categoryColumn, line.valueColumn])'
    );
    expect(source).toContain('sizeColumn: nextSizeColumn');
  });

  it('resets categorical label state when polygon, text, and text-background category mappings change', () => {
    expect(source).toContain('const nextPolygonClassification =');
    expect(source).toContain('const nextRootPolygonClassification =');
    expect(source).toContain('const nextTextClassification =');
    expect(source).toContain('const nextClassification =');
    expect(source).toContain('const nextStrokeClassification =');
    expect(source.match(/labels: \[\]/g)?.length).toBeGreaterThanOrEqual(5);
    expect(
      source.match(/disabledLabels: undefined/g)?.length
    ).toBeGreaterThanOrEqual(5);
  });

  it('clears stale categoryValues and colors when a category column changes so the map recomputes instead of falling back to grey', () => {
    // Regression for the "grey symbols on category variable change" bug:
    // resetting only labels/disabledLabels left the color map keyed to the
    // previous column's values, rendering every symbol with the grey fallback.
    expect(
      source.match(/categoryValues: undefined/g)?.length
    ).toBeGreaterThanOrEqual(5);
    expect(source.match(/colors: undefined/g)?.length).toBeGreaterThanOrEqual(
      5
    );
  });

  it('uses a four-class default only for polygon fill classifications', () => {
    expect(source).toContain('const DEFAULT_CLASS_COUNT = 5;');
    expect(source).toContain('const DEFAULT_POLYGON_FILL_CLASS_COUNT = 4;');
    expect(source).toContain('primitive === PrimitiveFilterType.POLYGON');
    expect(source).toContain('classes: defaultClassCount');
    expect(source).toContain('numClasses: defaultClassCount');
  });
});
