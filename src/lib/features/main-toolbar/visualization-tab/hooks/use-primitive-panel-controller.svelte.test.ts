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
});
