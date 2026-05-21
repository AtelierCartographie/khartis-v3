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
      "import FillSection from '../shared/fill-section.svelte'"
    );
    expect(source).toContain('<FillSection');
  });

  it('passes the polygon-specific availableModes with DENSITY', () => {
    expect(source).toContain('availableModes={FILL_MODES_WITH_DENSITY}');
    expect(source).toContain(
      "import { FILL_MODES_WITH_DENSITY } from '../shared/fill-mode-presets'"
    );
  });

  it('sets categoriesVariant to polygons without a redundant primitive tag', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).not.toContain('primitive=');
    expect(fillBlock).toContain('categoriesVariant="polygons"');
  });

  it('provides the density snippet consumed by FillSection for the DENSITY branch', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toContain('{#snippet densitySnippet()}');
    expect(fillBlock).toContain('<PolygonModeDensity');
    expect(fillBlock).toContain('onDensityChange={onDensityChange}');
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

  it('routes polygon missing-data motif state through FillSection', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(source).toContain('let missingDataPattern = $state<boolean>(false)');
    expect(source).toContain(
      'missingDataPattern = visualization.missingData.pattern ?? false'
    );
    expect(source).toContain('function handleMissingDataPatternChange');
    expect(fillBlock).toContain('missingDataPattern={missingDataPattern}');
    expect(fillBlock).toContain(
      'onMissingDataPatternChange={handleMissingDataPatternChange}'
    );
  });

  it('keeps StrokeSection branch unchanged and gated on non-DENSITY fill mode', () => {
    expect(source).toContain('{#if effectiveFillMode !== FillMode.DENSITY}');
    expect(source).toContain('<StrokeSection');
    expect(source).toContain(
      'onStrokeClassificationChange={handleStrokeDiscretizationChange}'
    );
  });

  it('passes polygon missing-data state to StrokeSection for contour classes/categories', () => {
    const strokeBlock = source.split('<StrokeSection')[1]?.split('/>')[0];
    expect(strokeBlock).toBeDefined();
    expect(strokeBlock).toContain('showMissingData={showMissingData}');
    expect(strokeBlock).toContain('missingDataColor={missingDataColor}');
    expect(strokeBlock).toContain(
      'onMissingDataShowChange={handleMissingDataShowChange}'
    );
    expect(strokeBlock).toContain(
      'onMissingDataColorChange={handleMissingDataColorChange}'
    );
  });

  it('limits polygon contour thickness to 10 through the shared StrokeSection', () => {
    const strokeBlock = source.split('<StrokeSection')[1]?.split('/>')[0];
    expect(source).toContain('const POLYGON_STROKE_WIDTH_MAX = 10;');
    expect(strokeBlock).toContain('maxStrokeWidth={POLYGON_STROKE_WIDTH_MAX}');
  });

  it('resets polygon classed fill opacity to 100% when entering En classes', () => {
    expect(source).toContain('const POLYGON_CLASSES_FILL_OPACITY');
    expect(source).toContain('previousFillMode !== FillMode.CLASSES');
    expect(source).toContain(
      'updates.fillOpacity = POLYGON_CLASSES_FILL_OPACITY'
    );
  });

  it('exposes FillMode.DENSITY through PolygonModeDensity in the density snippet', () => {
    expect(source).toContain('FillMode.DENSITY');
    expect(source).toContain('<PolygonModeDensity');
    expect(source).toContain("from '.'");
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
    expect(source).toContain('valueColumn={activeDiscretizationValueColumn}');
    expect(source).toContain('visualization?.polygon?.strokeValueColumn');
    expect(source).toContain('visualization?.polygon?.valueColumn');
  });
});

describe('PolygonsConfig — filters', () => {
  it('forwards clear-all to the shared filter panel', () => {
    expect(source).toContain('onClearFilters?: () => void');
    expect(source).toContain('onClearFilters={onClearFilters}');
  });
});
