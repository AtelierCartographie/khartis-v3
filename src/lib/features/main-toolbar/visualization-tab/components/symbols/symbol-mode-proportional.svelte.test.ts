import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-proportional.svelte'),
  'utf8'
);

describe('SymbolModeProportional (proportionnels.png + en classes.png)', () => {
  it('gates the max-size slider on CLASSES mode only', () => {
    expect(source).toContain('{#if symbolMode === SymbolMode.CLASSES}');
    const classesBlock = source.split(
      '{#if symbolMode === SymbolMode.CLASSES}'
    )[1];
    expect(classesBlock).toContain('label={m.max_size()}');
  });

  it('removes the linear/sqrt/log scale selector from PROPORTIONAL UI', () => {
    expect(source).not.toContain('id="scale-type"');
    expect(source).not.toContain('{m.scale_linear()}');
  });

  it('gates the shape selector on CLASSES mode only and uses Dropdown', () => {
    expect(source).not.toContain('items={shapeItems}');
    expect(source).toContain('items={shapeDropdownItems}');
  });

  it('keeps the Uniques/Doubles radio group in PROPORTIONAL', () => {
    expect(source).toContain('id="prop-single"');
    expect(source).toContain('id="prop-double"');
  });

  it('uses MissingDataSection with shape selector and size slider enabled', () => {
    expect(source).toContain('showShapeSelector={true}');
    expect(source).toContain('showSizeSlider={true}');
  });
});
