import { describe, it, expect, vi } from 'vitest';
import {
  buildLineThicknessTarget,
  buildPrimitiveClassificationTargets,
  buildPrimitiveStrokeClassificationTargets,
  buildSymbolFillTarget,
  buildTextBackgroundStrokeTarget,
  buildTextBackgroundTarget
} from './classification-targets.utils';
import { FillMode, StrokeMode } from '../../constants';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => {
  return {
    PrimitiveFilterType: {
      POINT: 'point',
      POLYGON: 'polygon',
      LINE: 'line',
      TEXT: 'text'
    },
    getLinePrimitive: vi.fn((viz) => viz?.line),
    getLineThicknessClassification: vi.fn(
      (viz) => viz?.line?.thicknessClassification
    ),
    getPrimitiveCategoryColumn: vi.fn(
      (_viz, primitive) => `cat-${String(primitive)}`
    ),
    getPrimitiveClassification: vi.fn((_viz, primitive) => ({
      labels: [String(primitive)]
    })),
    getPrimitiveValueColumn: vi.fn(
      (_viz, primitive) => `val-${String(primitive)}`
    ),
    getSymbolFillCategoryColumn: vi.fn(() => 'symbolFillCat'),
    getSymbolFillClassification: vi.fn(() => ({ labels: ['fill'] })),
    getSymbolFillValueColumn: vi.fn(() => 'symbolFillValue'),
    getSymbolPrimitive: vi.fn((viz) => viz?.symbol),
    getTextPrimitive: vi.fn((viz) => viz?.text)
  };
});

vi.mock('./use-primitive-panel-controller.svelte', () => ({
  CLASSIFIABLE_PRIMITIVES: ['point', 'polygon', 'line', 'text'],
  STROKE_CLASSIFIABLE_PRIMITIVES: ['point', 'polygon']
}));

describe('classification-targets.utils', () => {
  it('buildPrimitiveClassificationTargets uses LINE colorMode for line breaks', () => {
    const viz = {
      line: { colorMode: 'classes' }
    };
    const targets = buildPrimitiveClassificationTargets(viz as never, {
      usesBreakClassification: vi.fn().mockReturnValue(false),
      usesCategoricalClassification: vi.fn().mockReturnValue(false)
    });

    const lineTarget = targets.find((t) => t.primitive === 'line');
    expect(lineTarget?.usesBreaks).toBe(true);
  });

  it('buildPrimitiveClassificationTargets falls back to usesBreakClassification for non-line', () => {
    const usesBreakClassification = vi.fn().mockReturnValue(true);
    const usesCategoricalClassification = vi.fn().mockReturnValue(false);

    const targets = buildPrimitiveClassificationTargets({} as never, {
      usesBreakClassification,
      usesCategoricalClassification
    });

    expect(usesBreakClassification).toHaveBeenCalled();
    const polygonTarget = targets.find((t) => t.primitive === 'polygon');
    expect(polygonTarget?.usesBreaks).toBe(true);
  });

  it('buildLineThicknessTarget returns null when no line primitive', () => {
    const target = buildLineThicknessTarget({} as never, {
      usesLineThicknessBreakClassification: vi.fn().mockReturnValue(false)
    });
    expect(target).toBeNull();
  });

  it('buildLineThicknessTarget returns thickness target with classification when present', () => {
    const target = buildLineThicknessTarget(
      {
        line: {
          valueColumn: 'population',
          thicknessClassification: { labels: ['l1'] }
        }
      } as never,
      {
        usesLineThicknessBreakClassification: vi.fn().mockReturnValue(true)
      }
    );
    expect(target?.usesBreaks).toBe(true);
    expect(target?.valueColumn).toBe('population');
  });

  it('buildPrimitiveStrokeClassificationTargets builds via builders', () => {
    const builders = {
      getPrimitiveStrokeValueColumn: vi.fn().mockReturnValue('strokeVal'),
      getPrimitiveStrokeCategoryColumn: vi.fn().mockReturnValue('strokeCat'),
      getPrimitiveStrokeClassification: vi
        .fn()
        .mockReturnValue({ labels: ['s'] }),
      usesStrokeBreakClassification: vi.fn().mockReturnValue(false),
      usesStrokeCategoricalClassification: vi.fn().mockReturnValue(true)
    };

    const targets = buildPrimitiveStrokeClassificationTargets(
      {} as never,
      builders
    );
    expect(targets).toHaveLength(2);
    expect(targets[0].usesCategories).toBe(true);
  });

  it('buildSymbolFillTarget returns null when no symbol primitive', () => {
    const target = buildSymbolFillTarget({} as never, {
      usesSymbolFillBreakClassification: vi.fn(),
      usesSymbolFillCategoricalClassification: vi.fn()
    });
    expect(target).toBeNull();
  });

  it('buildSymbolFillTarget returns fillMode + columns when present', () => {
    const target = buildSymbolFillTarget(
      { symbol: { fillMode: FillMode.UNIQUE } } as never,
      {
        usesSymbolFillBreakClassification: vi.fn().mockReturnValue(false),
        usesSymbolFillCategoricalClassification: vi.fn().mockReturnValue(true)
      }
    );
    expect(target?.fillMode).toBe(FillMode.UNIQUE);
    expect(target?.usesCategories).toBe(true);
  });

  it('buildTextBackgroundTarget derives usesBreaks from CLASSES fillMode', () => {
    const target = buildTextBackgroundTarget({
      text: { background: { fillMode: FillMode.CLASSES, valueColumn: 'v' } }
    } as never);
    expect(target?.usesBreaks).toBe(true);
    expect(target?.usesCategories).toBe(false);
  });

  it('buildTextBackgroundTarget derives usesCategories from CATEGORIES fillMode', () => {
    const target = buildTextBackgroundTarget({
      text: { background: { fillMode: FillMode.CATEGORIES } }
    } as never);
    expect(target?.usesBreaks).toBe(false);
    expect(target?.usesCategories).toBe(true);
  });

  it('buildTextBackgroundStrokeTarget derives strokeMode-based flags', () => {
    const target = buildTextBackgroundStrokeTarget({
      text: { background: { strokeMode: StrokeMode.CATEGORIES } }
    } as never);
    expect(target?.usesCategories).toBe(true);
    expect(target?.usesBreaks).toBe(false);
  });
});
