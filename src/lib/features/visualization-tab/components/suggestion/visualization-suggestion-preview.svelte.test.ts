import { describe, expect, it } from 'vitest';
import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import { buildVizPreview } from '../../utils/viz-preview.utils';

function suggestion(
  overrides: Partial<VizSuggestion> & { id: string }
): VizSuggestion {
  return {
    label: overrides.id,
    nbColumns: 0,
    semioTypes: [],
    geometries: ['polygon'],
    ...overrides
  };
}

// Les compositions réellement déclarées dans VIZ_CRITERIA, dont les neuf fratries
// QL / QLO / QTR que l'ancienne vignette rendait à l'identique.
const COMPOSITIONS: VizSuggestion[] = [
  suggestion({ id: 'symbols_uniques', geometries: ['point', 'polygon'] }),
  suggestion({ id: 'polygons_uniques' }),
  suggestion({ id: 'lines_uniques', geometries: ['line'] }),
  suggestion({
    id: 'symbols_proportional',
    geometries: ['point', 'polygon'],
    semioTypes: ['QTA'],
    nbColumns: 1
  }),
  suggestion({
    id: 'lines_proportional',
    geometries: ['line'],
    semioTypes: ['QTA'],
    nbColumns: 1
  }),
  suggestion({ id: 'choropleth', semioTypes: ['QTR'], nbColumns: 1 }),
  suggestion({ id: 'polygons_colorful_QL', semioTypes: ['QL'], nbColumns: 1 }),
  suggestion({
    id: 'polygons_colorful_QLO',
    semioTypes: ['QLO'],
    nbColumns: 1
  }),
  suggestion({
    id: 'symbols_uniques_colorful_QTR',
    geometries: ['point', 'polygon'],
    semioTypes: ['QTR'],
    nbColumns: 1
  }),
  suggestion({
    id: 'symbols_uniques_colorful_QL',
    geometries: ['point', 'polygon'],
    semioTypes: ['QL'],
    nbColumns: 1
  }),
  suggestion({
    id: 'symbols_uniques_colorful_QLO',
    geometries: ['point', 'polygon'],
    semioTypes: ['QLO'],
    nbColumns: 1
  }),
  suggestion({
    id: 'symbols_differents',
    geometries: ['point', 'polygon'],
    semioTypes: ['QL'],
    nbColumns: 1
  }),
  suggestion({
    id: 'symbols_differents_QLO',
    geometries: ['point', 'polygon'],
    semioTypes: ['QLO'],
    nbColumns: 1
  }),
  suggestion({
    id: 'lines_colorful_QTR',
    geometries: ['line'],
    semioTypes: ['QTR'],
    nbColumns: 1
  }),
  suggestion({
    id: 'lines_colorful_QL',
    geometries: ['line'],
    semioTypes: ['QL'],
    nbColumns: 1
  }),
  suggestion({
    id: 'lines_colorful_QLO',
    geometries: ['line'],
    semioTypes: ['QLO'],
    nbColumns: 1
  }),
  suggestion({
    id: 'symbols_proportional_colorful_QTR',
    geometries: ['point', 'polygon'],
    semioTypes: ['QTA', 'QTR'],
    nbColumns: 2
  }),
  suggestion({
    id: 'symbols_proportional_colorful_QL',
    geometries: ['point', 'polygon'],
    semioTypes: ['QTA', 'QL'],
    nbColumns: 2
  }),
  suggestion({
    id: 'symbols_proportional_double',
    geometries: ['point', 'polygon'],
    semioTypes: ['QTA', 'QTA'],
    nbColumns: 2
  }),
  suggestion({
    id: 'symbols_proportional_labeled',
    geometries: ['point', 'polygon'],
    semioTypes: ['QTA', 'label'],
    nbColumns: 2
  }),
  suggestion({
    id: 'choropleth_labeled',
    semioTypes: ['QTR', 'label'],
    nbColumns: 2
  }),
  suggestion({
    id: 'texts_colorful_QL',
    geometries: ['point', 'polygon'],
    semioTypes: ['QL', 'QL'],
    nbColumns: 2
  }),
  suggestion({
    id: 'texts_colorful_QTR',
    geometries: ['point', 'polygon'],
    semioTypes: ['QL', 'QTR'],
    nbColumns: 2
  }),
  suggestion({
    id: 'texts_proportional',
    geometries: ['point', 'polygon'],
    semioTypes: ['QL', 'QTA'],
    nbColumns: 2
  })
];

function fingerprint(viz: VizSuggestion): string {
  return JSON.stringify(buildVizPreview(viz));
}

describe('buildVizPreview', () => {
  it('gives every declared composition its own image', () => {
    const byFingerprint = new Map<string, string[]>();
    for (const viz of COMPOSITIONS) {
      const key = fingerprint(viz);
      byFingerprint.set(key, [...(byFingerprint.get(key) ?? []), viz.id]);
    }

    const collisions = [...byFingerprint.values()].filter(
      (ids) => ids.length > 1
    );
    expect(collisions).toEqual([]);
  });

  it('reads the composition from the semio types, not from the suggestion id', () => {
    const declared = suggestion({
      id: 'choropleth',
      semioTypes: ['QTR'],
      nbColumns: 1
    });
    const renamed = suggestion({
      id: 'renamed_beyond_recognition',
      semioTypes: ['QTR'],
      nbColumns: 1
    });

    expect(fingerprint(renamed)).toBe(fingerprint(declared));
  });

  it('freezes the width of a unique line layer and drives it for a proportional one', () => {
    const widthsOf = (viz: VizSuggestion) =>
      new Set(
        buildVizPreview(viz)
          .filter((shape) => shape.kind === 'path' && shape.fill === 'none')
          .map((shape) => (shape as { strokeWidth?: number }).strokeWidth)
      );

    expect(
      widthsOf(suggestion({ id: 'lines_uniques', geometries: ['line'] })).size
    ).toBe(1);
    expect(
      widthsOf(
        suggestion({
          id: 'lines_proportional',
          geometries: ['line'],
          semioTypes: ['QTA'],
          nbColumns: 1
        })
      ).size
    ).toBeGreaterThan(1);
  });

  it('never draws a nominal variable as an ordered ramp', () => {
    const nominal = buildVizPreview(
      suggestion({
        id: 'polygons_colorful_QL',
        semioTypes: ['QL'],
        nbColumns: 1
      })
    );
    const cellFills = nominal
      .filter((shape) => shape.kind === 'path')
      .map((shape) => (shape as { fill: string }).fill);

    // Une rampe ne peut pas répéter une couleur : la répétition atteste le qualitatif.
    expect(new Set(cellFills).size).toBeLessThan(cellFills.length);
  });

  it('respects the legibility floors of the design system', () => {
    for (const viz of COMPOSITIONS) {
      for (const shape of buildVizPreview(viz)) {
        if ('strokeWidth' in shape && shape.strokeWidth !== undefined) {
          expect(
            shape.strokeWidth,
            `${viz.id} stroke-width`
          ).toBeGreaterThanOrEqual(1);
        }
        if (shape.kind === 'text') {
          expect(shape.fontSize, `${viz.id} font-size`).toBeGreaterThanOrEqual(
            12
          );
          expect(shape.x, `${viz.id} label x`).toBeGreaterThan(0);
          expect(shape.x, `${viz.id} label x`).toBeLessThan(120);
          expect(shape.y, `${viz.id} label y`).toBeLessThan(120);
        }
      }
    }
  });
});
