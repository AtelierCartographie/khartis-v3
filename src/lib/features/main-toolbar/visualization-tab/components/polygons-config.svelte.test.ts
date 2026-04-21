import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'polygons-config.svelte'),
  'utf8'
);

describe('PolygonsConfig — FillSection wiring', () => {
  it('delegates fill rendering to the shared FillSection component', () => {
    expect(source).toContain(
      "import FillSection from './shared/fill-section.svelte'"
    );
    expect(source).toContain('<FillSection');
  });

  it('passes the polygon-specific availableModes with DENSITY', () => {
    expect(source).toContain('availableModes={FILL_MODES_WITH_DENSITY}');
    expect(source).toContain(
      "import { FILL_MODES_WITH_DENSITY } from './shared/fill-mode-presets'"
    );
  });

  it('tags the primitive as polygon and sets categoriesVariant to polygons', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).toContain('primitive="polygon"');
    expect(fillBlock).toContain('categoriesVariant="polygons"');
  });

  it('provides the density snippet consumed by FillSection for the DENSITY branch', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toContain('{#snippet densitySnippet()}');
    expect(fillBlock).toContain('<PolygonModeDensity');
  });

  it('wires handleFillColorChange / handleFillOpacityChange / handleClassificationChange', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toContain('onFillColorChange={handleFillColorChange}');
    expect(fillBlock).toContain(
      'onFillOpacityChange={handleFillOpacityChange}'
    );
    expect(fillBlock).toContain(
      'onClassificationChange={handleClassificationChange}'
    );
  });

  it('keeps StrokeSection branch unchanged and gated on non-DENSITY fill mode', () => {
    expect(source).toContain('{#if effectiveFillMode !== FillMode.DENSITY}');
    expect(source).toContain('<StrokeSection');
    expect(source).toContain(
      'onStrokeClassificationChange={handleStrokeDiscretizationChange}'
    );
  });

  it('exposes FillMode.DENSITY through PolygonModeDensity in the density snippet', () => {
    expect(source).toContain('FillMode.DENSITY');
    expect(source).toContain('<PolygonModeDensity');
    expect(source).toContain("from './polygons'");
  });
});

describe('PolygonsConfig — discretization routing', () => {
  it('routes fill and stroke discretization openings through distinct targets', () => {
    expect(source).toContain("discretizationTarget = 'fill'");
    expect(source).toContain("discretizationTarget = 'stroke'");
  });

  it('binds the stroke section to polygon stroke-specific classification state', () => {
    expect(source).toContain(
      'strokeClassification={visualization?.polygon?.strokeClassification}'
    );
    expect(source).toContain(
      'strokeValueColumn={visualization?.polygon?.strokeValueColumn}'
    );
    expect(source).toContain(
      'strokeCategoryColumn={visualization?.polygon?.strokeCategoryColumn}'
    );
  });

  it('forwards the active discretization role and matching value column to the shared modal', () => {
    expect(source).toContain(
      'classification={activeDiscretizationClassification}'
    );
    expect(source).toContain('role={discretizationTarget}');
    expect(source).toContain("valueColumn={discretizationTarget === 'stroke'");
    expect(source).toContain('visualization?.polygon?.strokeValueColumn');
    expect(source).toContain('visualization?.polygon?.valueColumn');
  });
});
