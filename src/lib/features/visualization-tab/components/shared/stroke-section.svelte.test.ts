import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLIDER_LIMITS } from '$lib/features/commons/constants/visualization.constants';

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

  it('delegates the CLASSES-mode paletteType to resolvePaletteTypeForBreakpoint so DIVERGING/SEQUENTIAL stays in sync with the helper', () => {
    expect(source).toContain(
      'paletteType={resolvePaletteTypeForBreakpoint(strokeClassification)}'
    );
    expect(source).toContain('resolvePaletteTypeForBreakpoint');
  });

  it('should wire QUALITATIVE paletteType on the categories-mode stroke palette', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
  });

  it('should never render a PalettePreview without an explicit paletteType prop', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    paletteBlocks.forEach((block) => {
      expect(block).toMatch(/paletteType=/);
      expect(block).toMatch(
        /(PALETTE_TYPE\.(SEQUENTIAL|QUALITATIVE|DIVERGING)|resolvePaletteTypeForBreakpoint)/
      );
    });
  });
});

describe('StrokeSection — anti-leak fill↔stroke', () => {
  it('allows contour thickness up to 20', () => {
    expect(SLIDER_LIMITS.strokeWidth.max).toBe(20);
    expect(source).toContain('max={SLIDER_LIMITS.strokeWidth.max}');
  });

  it('restores a visible stroke width when an active stroke mode inherits width 0', () => {
    expect(source).toContain('function ensureVisibleStrokeWidth()');
    expect(source).toContain(
      'if (strokeMode === StrokeMode.NONE || strokeWidth > 0)'
    );
    expect(source).toContain(
      'strokeWidth = VISUALIZATION_DEFAULTS.strokeWidth;'
    );
    expect(source).toContain(
      'onStyleChange?.({ strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth });'
    );
  });

  it('should require onStrokeClassificationChange (non-optional) in Props', () => {
    const propsMatch = source.match(/onStrokeClassificationChange[^?:]*:\s*\(/);
    expect(propsMatch).not.toBeNull();
    expect(source).not.toContain('onStrokeClassificationChange?:');
  });

  it('should not declare an onClassificationChange prop (leak vector)', () => {
    expect(source).not.toMatch(/onClassificationChange[?:]?:\s*\(/);
  });

  it('should expose a dedicated onStrokeMappingChange prop for stroke-only field binding', () => {
    expect(source).toContain('onStrokeMappingChange?:');
    expect(source).toContain(
      'const handleMappingChange = onStrokeMappingChange ?? onMappingChange;'
    );
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

  it('should read stroke-specific mapped columns before falling back to generic mapping', () => {
    expect(source).toContain(
      'strokeCategoryColumn ?? visualization?.mapping.categoryColumn'
    );
    expect(source).toContain(
      'strokeValueColumn ?? visualization?.mapping.valueColumn'
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

  it('opens the categories aspect popover directly instead of routing through the discretization modal', () => {
    expect(source).toContain(
      'bind:categoriesPopoverOpen={categoriesPopoverOpen}'
    );
    expect(source).toContain('categoriesPopoverOpen = true;');
  });
});

describe('StrokeSection — missing data controls', () => {
  it('renders the shared MissingDataSection for classes and categories stroke modes', () => {
    expect(source).toContain(
      "import MissingDataSection from './missing-data-section.svelte'"
    );
    expect(source).toContain('showMissingDataSection?: boolean;');
    expect(source).toContain('showMissingDataSection = true');
    expect(source).toContain(
      'strokeMode === StrokeMode.CLASSES || strokeMode === StrokeMode.CATEGORIES'
    );
    const missingDataBlock = source
      .split('<MissingDataSection')[1]
      ?.split('/>')[0];
    expect(missingDataBlock).toBeDefined();
    expect(missingDataBlock).toContain('bind:show={strokeShowMissing}');
    expect(missingDataBlock).toContain('color={resolvedMissingDataColor}');
    expect(missingDataBlock).toContain('showShapeSelector={false}');
    expect(missingDataBlock).toContain('showSizeSlider={false}');
    expect(missingDataBlock).toContain(
      'onshowchange={handleStrokeShowMissingChange}'
    );
    expect(missingDataBlock).toContain(
      'oncolorchange={onMissingDataColorChange'
    );
  });

  it('routes the stroke missing-data toggle to primitive missingData state and keeps the legacy mode mirror in sync', () => {
    expect(source).toContain('showMissingData?: boolean;');
    expect(source).toContain('missingDataColor?: string;');
    expect(source).toContain('onMissingDataShowChange?:');
    expect(source).toContain('onMissingDataColorChange?:');
    expect(source).toContain('onMissingDataShowChange?.(value);');
    expect(source).toContain('onModesChange?.({ strokeShowMissing: value });');
  });
});
