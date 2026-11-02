import { describe, expect, it } from 'vitest';
import {
  divergingPalettes,
  qualitativePalettes,
  sequentialPalettes
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { buildProjectSnapshot } from './project-snapshot';
import {
  parseGoToStepInput,
  parseLayoutTextsInput,
  parseLegendTextsInput,
  parseUpdateClassificationInput
} from './validation';

const SEQUENTIAL_ID = sequentialPalettes[0].id;
const DIVERGING_ID = divergingPalettes[0].id;
const QUALITATIVE_ID = qualitativePalettes[0].id;

describe('agent command validation', () => {
  it('should accept a classification change when every field is allowed', () => {
    const result = parseUpdateClassificationInput({
      visualization_id: 'viz-1',
      method: 'quantiles',
      classes: 5,
      palette_id: SEQUENTIAL_ID,
      inverted: true
    });

    expect(result).toEqual({
      ok: true,
      value: {
        visualizationId: 'viz-1',
        method: 'quantiles',
        classes: 5,
        paletteId: SEQUENTIAL_ID,
        inverted: true
      }
    });
  });

  it('should accept a diverging palette when classes are requested', () => {
    const result = parseUpdateClassificationInput({
      visualization_id: 'viz-1',
      palette_id: DIVERGING_ID
    });

    expect(result.ok).toBe(true);
  });

  it.each([
    ['an unknown method', { method: 'jenks' }],
    ['the manual method, which needs bounds', { method: 'manual' }],
    ['the calendar method, chosen by the column', { method: 'calendar' }],
    ['a single class', { classes: 1 }],
    ['more classes than the panel offers', { classes: 13 }],
    ['a fractional class count', { classes: 4.5 }],
    ['a class count given as text', { classes: '5' }],
    ['an unknown palette', { palette_id: 'not-a-palette' }],
    ['a qualitative palette for classes', { palette_id: QUALITATIVE_ID }],
    ['an inversion given as text', { inverted: 'yes' }],
    ['no change at all', {}],
    ['an unexpected field', { method: 'quantiles', breaks: [1, 2, 3] }]
  ])('should refuse a classification change when it has %s', (_, fields) => {
    const result = parseUpdateClassificationInput({
      visualization_id: 'viz-1',
      ...fields
    });

    expect(result.ok).toBe(false);
  });

  it('should refuse a classification change when the visualization is missing', () => {
    expect(parseUpdateClassificationInput({ method: 'quantiles' }).ok).toBe(
      false
    );
    expect(parseUpdateClassificationInput(null).ok).toBe(false);
  });

  it('should accept page texts when they are strings, including an empty one', () => {
    expect(
      parseLayoutTextsInput({ title: 'Taux de pauvreté, 2023', source: '' })
    ).toEqual({
      ok: true,
      value: { title: 'Taux de pauvreté, 2023', source: '' }
    });
  });

  it.each([
    ['no text', {}],
    ['a text that is not a string', { title: 42 }],
    ['a title longer than the limit', { title: 'x'.repeat(201) }],
    ['a control character', { subtitle: 'line\u0007bell' }],
    ['a role the tool does not write', { credit: 'Atelier' }]
  ])('should refuse page texts when they have %s', (_, input) => {
    expect(parseLayoutTextsInput(input).ok).toBe(false);
  });

  it('should keep line breaks in a source when they are plain newlines', () => {
    const result = parseLayoutTextsInput({ source: 'Insee, 2023\nIGN' });

    expect(result.ok).toBe(true);
  });

  it('should refuse legend texts when the legend is missing or nothing changes', () => {
    expect(parseLegendTextsInput({ title: 'Taux' }).ok).toBe(false);
    expect(parseLegendTextsInput({ legend_id: 'legend-1' }).ok).toBe(false);
    expect(
      parseLegendTextsInput({ legend_id: 'legend-1', title: 'Taux (%)' })
    ).toEqual({
      ok: true,
      value: { legendId: 'legend-1', title: 'Taux (%)' }
    });
  });

  it('should accept only the three steps of the toolbar', () => {
    expect(parseGoToStepInput({ step: 'styling' })).toEqual({
      ok: true,
      value: { step: 'styling' }
    });
    expect(parseGoToStepInput({ step: 'export' }).ok).toBe(false);
  });
});

describe('agent project snapshot', () => {
  const snapshot = buildProjectSnapshot({
    projectName: 'Pauvreté',
    step: 'visualizations',
    datasets: [
      {
        id: 'ds-1',
        name: 'pauvrete.csv',
        rowCount: 40,
        hasGeometry: false,
        joinedBasemap: 'communes-93',
        columns: [
          {
            name: 'commune',
            type: 'string',
            stats: {
              nulls: 0,
              uniques: 40,
              categories: ['Bobigny', 'Montreuil'],
              min: 'Aubervilliers',
              max: 'Villetaneuse'
            }
          },
          {
            name: 'taux_pauvrete',
            type: 'number',
            stats: {
              nulls: 2,
              uniques: 38,
              min: 7.25,
              max: 41.75,
              mean: 24.5,
              value_sample: [7.25, 12.5, 41.75]
            }
          }
        ]
      }
    ],
    visualizations: [
      {
        id: 'viz-1',
        name: 'Taux de pauvreté',
        datasetId: 'ds-1',
        enabled: true,
        primitives: [
          {
            primitive: 'polygon',
            mode: 'classes',
            valueColumn: 'taux_pauvrete',
            classification: {
              method: 'quantiles',
              classes: 5,
              paletteId: SEQUENTIAL_ID,
              inverted: false,
              breaks: [7.25, 15, 22, 30, 41.75],
              counts: [8, 8, 8, 8, 6]
            }
          }
        ]
      }
    ],
    pageTexts: [
      {
        role: 'title',
        content: 'Pauvreté en Seine-Saint-Denis',
        placeholder: false
      },
      { role: 'subtitle', content: 'Sous-titre', placeholder: true }
    ],
    legends: [
      {
        id: 'legend-1',
        visualizationId: 'viz-1',
        title: 'Taux de pauvreté',
        subtitle: '',
        note: ''
      }
    ]
  });
  const serialized = JSON.stringify(snapshot);

  it('should describe the map without any data value when columns carry statistics', () => {
    for (const value of [
      'Bobigny',
      'Montreuil',
      'Aubervilliers',
      'Villetaneuse',
      '7.25',
      '41.75',
      '24.5'
    ]) {
      expect(serialized).not.toContain(value);
    }
    expect(snapshot.datasets[0].columns).toEqual([
      { name: 'commune', type: 'string', missing_count: 0, distinct_count: 40 },
      {
        name: 'taux_pauvrete',
        type: 'number',
        missing_count: 2,
        distinct_count: 38
      }
    ]);
  });

  it('should leave out computed breaks and counts when a primitive is classed', () => {
    expect(snapshot.visualizations[0].primitives[0].classification).toEqual({
      method: 'quantiles',
      classes: 5,
      palette_id: SEQUENTIAL_ID,
      inverted: false
    });
  });

  it('should report a page text as empty when it is still a placeholder', () => {
    expect(snapshot.page_texts).toEqual({
      title: 'Pauvreté en Seine-Saint-Denis',
      subtitle: null,
      source: null
    });
  });
});
