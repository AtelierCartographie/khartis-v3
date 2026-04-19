import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'stroke-section.svelte'),
  'utf8'
);

describe('StrokeSection — palette wiring', () => {
  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(source).toContain(
      "from '$lib/features/commons/components/palette-popover/palette.constants'"
    );
    expect(source).toContain('PALETTE_TYPE');
  });

  it('should wire SEQUENTIAL paletteType on the classes-mode stroke palette', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
  });

  it('should wire QUALITATIVE paletteType on the categories-mode stroke palette', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
  });

  it('should never render a PalettePreview without an explicit paletteType', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    paletteBlocks.forEach((block) => {
      expect(block).toMatch(
        /paletteType=\{PALETTE_TYPE\.(SEQUENTIAL|QUALITATIVE)\}/
      );
    });
  });
});

describe('StrokeSection — anti-leak fill↔stroke', () => {
  it('should require onStrokeClassificationChange (non-optional) in Props', () => {
    const propsMatch = source.match(/onStrokeClassificationChange[^?:]*:\s*\(/);
    expect(propsMatch).not.toBeNull();
    expect(source).not.toContain('onStrokeClassificationChange?:');
  });

  it('should not declare an onClassificationChange prop (leak vector)', () => {
    expect(source).not.toMatch(/onClassificationChange[?:]?:\s*\(/);
  });

  it('should never fall back to onClassificationChange when the stroke handler is missing', () => {
    expect(source).not.toContain(
      'onStrokeClassificationChange ?? onClassificationChange'
    );
    expect(source).not.toContain(
      '(onStrokeClassificationChange ?? onClassificationChange)'
    );
  });

  it('should not read fill palette state to render the stroke preview', () => {
    expect(source).not.toContain('?? visualization?.classification?.paletteId');
    expect(source).not.toContain('?? visualization?.classification?.inverted');
    expect(source).not.toContain('?? visualization?.classification?.labels');
  });

  it('should derive stroke palette previews solely from strokeClassification', () => {
    expect(source).toContain(
      'strokeClassification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW'
    );
    expect(source).toContain(
      'strokeClassification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW'
    );
  });

  it('should pass onStrokeClassificationChange directly to every PalettePreview', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    paletteBlocks.forEach((block) => {
      expect(block).toContain(
        'onClassificationChange={onStrokeClassificationChange}'
      );
    });
  });
});
