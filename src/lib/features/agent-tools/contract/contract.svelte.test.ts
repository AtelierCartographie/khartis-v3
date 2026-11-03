import { describe, expect, it } from 'vitest';
import {
  divergingPalettes,
  qualitativePalettes,
  sequentialPalettes
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { ClassificationMethod } from '$lib/features/commons/stores/visualization.types';
import type { EnrichedColumn } from '$lib/features/data-pipeline';
import {
  buildProjectSnapshot,
  listCalculatedColumns,
  type ProjectSnapshotInput
} from './project-snapshot';
import { reviewMap, type MapReviewInput } from './map-review';
import { splitExpectedRevision } from './revision';
import {
  parseLayoutTextsInput,
  parseLegendTextsInput,
  parseSetTextInput,
  parseUpdateClassificationInput,
  refuseForChoropleth
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
    ['a C1 control character', { subtitle: 'line\u0085next' }],
    ['a bidirectional override', { title: 'Taux \u202Eedis' }],
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

  it('should refuse a text change when the text id or the text is missing', () => {
    expect(parseSetTextInput({ text: 'Source : Insee' }).ok).toBe(false);
    expect(parseSetTextInput({ text_id: 'annotation-1' }).ok).toBe(false);
    expect(
      parseSetTextInput({ text_id: 'annotation-1', text: 'Source : Insee' })
    ).toEqual({
      ok: true,
      value: { textId: 'annotation-1', text: 'Source : Insee' }
    });
  });
});

const SNAPSHOT_INPUT: ProjectSnapshotInput = {
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
          type: 'text' as EnrichedColumn['type'],
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
          type: 'number' as EnrichedColumn['type'],
          nature: 'ratio',
          stats: {
            nulls: 2,
            uniques: 38,
            min: 7.25,
            max: 41.75,
            mean: 24.5,
            value_sample: [7.25, 12.5, 41.75]
          }
        },
        {
          name: '__id',
          type: 'number' as EnrichedColumn['type'],
          stats: { nulls: 0, uniques: 40 }
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
            method: ClassificationMethod.QUANTILES,
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
  texts: [
    {
      id: 'text-1',
      role: 'title',
      content: 'Pauvreté en Seine-Saint-Denis',
      placeholder: false
    },
    {
      id: 'text-2',
      role: 'subtitle',
      content: 'Sous-titre',
      placeholder: true
    },
    {
      id: 'text-3',
      content: 'Source : Insee, Filosofi 2021',
      placeholder: false
    }
  ],
  legends: [
    {
      id: 'legend-1',
      visualizationId: 'viz-1',
      visible: true,
      title: 'Taux de pauvreté',
      subtitle: '',
      note: ''
    }
  ]
};

describe('agent project snapshot', () => {
  const snapshot = buildProjectSnapshot(SNAPSHOT_INPUT);
  const serialized = JSON.stringify(snapshot);

  it('should describe the map without any data value or internal column when columns carry statistics', () => {
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
      {
        name: 'commune',
        type: 'text',
        nature: null,
        missing_count: 0,
        distinct_count: 40
      },
      {
        name: 'taux_pauvrete',
        type: 'number',
        nature: 'ratio',
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

  it('should list every text of the page with its id when some have no role', () => {
    expect(snapshot.texts).toEqual([
      { id: 'text-1', role: 'title', text: 'Pauvreté en Seine-Saint-Denis' },
      { id: 'text-2', role: 'subtitle', text: null },
      { id: 'text-3', role: null, text: 'Source : Insee, Filosofi 2021' }
    ]);
  });
});

describe('agent calculated columns', () => {
  it('should list calculated columns by name when renames and drops follow', () => {
    expect(
      listCalculatedColumns([
        { type: 'calculate', column: 'densite', newValue: '"pop" / "surface"' },
        { type: 'calculate', column: 'ecart', newValue: '"a" - "b"' },
        { type: 'rename', column: 'densite', newValue: 'densite_km2' },
        { type: 'drop', column: 'ecart' },
        { type: 'rename', column: 'commune', newValue: 'nom' }
      ])
    ).toEqual(['densite_km2']);
  });

  it('should leave the formula out when it holds a place name or a threshold', () => {
    const snapshot = buildProjectSnapshot({
      ...SNAPSHOT_INPUT,
      datasets: [
        {
          ...SNAPSHOT_INPUT.datasets[0],
          columnChanges: [
            {
              type: 'calculate',
              column: 'pauvrete_forte',
              newValue:
                'CASE WHEN "commune" = \'Bobigny\' OR "revenu" > 21500 THEN 1 ELSE 0 END'
            }
          ]
        }
      ]
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.datasets[0].calculated_columns).toEqual(['pauvrete_forte']);
    expect(serialized).not.toContain('Bobigny');
    expect(serialized).not.toContain('21500');
  });
});

describe('agent revision', () => {
  const revision = buildProjectSnapshot(SNAPSHOT_INPUT).revision;

  it('should keep the revision when only the step changes', () => {
    expect(
      buildProjectSnapshot({ ...SNAPSHOT_INPUT, step: 'styling' }).revision
    ).toBe(revision);
  });

  it('should give a new revision when a filter changes without showing it', () => {
    const [visualization] = SNAPSHOT_INPUT.visualizations;
    const filtered = buildProjectSnapshot({
      ...SNAPSHOT_INPUT,
      visualizations: [{ ...visualization, revisionKey: 'filter: Bobigny' }]
    });

    expect(filtered.revision).not.toBe(revision);
    expect(JSON.stringify(filtered)).not.toContain('Bobigny');
  });

  it('should give a new revision when a page text or the classes change', () => {
    const retitled = buildProjectSnapshot({
      ...SNAPSHOT_INPUT,
      texts: SNAPSHOT_INPUT.texts.map((text) =>
        text.id === 'text-1' ? { ...text, content: 'Autre titre' } : text
      )
    });
    const [visualization] = SNAPSHOT_INPUT.visualizations;
    const reclassed = buildProjectSnapshot({
      ...SNAPSHOT_INPUT,
      visualizations: [
        {
          ...visualization,
          primitives: [
            {
              ...visualization.primitives[0],
              classification: {
                ...visualization.primitives[0].classification,
                classes: 4
              }
            }
          ]
        }
      ]
    });

    expect(retitled.revision).not.toBe(revision);
    expect(reclassed.revision).not.toBe(revision);
  });

  it('should take the expected revision out of an input when it is well formed', () => {
    expect(
      splitExpectedRevision({ title: 'Titre', expected_revision: revision })
    ).toEqual({
      ok: true,
      value: { input: { title: 'Titre' }, expectedRevision: revision }
    });
    expect(splitExpectedRevision({ title: 'Titre' })).toEqual({
      ok: true,
      value: { input: { title: 'Titre' } }
    });
  });

  it.each([['latest'], [42], [null], ['ABCDEF12']])(
    'should refuse an expected revision when it is %s',
    (expectedRevision) => {
      expect(
        splitExpectedRevision({ expected_revision: expectedRevision }).ok
      ).toBe(false);
    }
  );
});

describe('agent map review', () => {
  const READY_MAP: MapReviewInput = {
    pageTitle: 'Pauvreté en Seine-Saint-Denis',
    pageSource: 'Insee, Filosofi 2021',
    freeTexts: [],
    visualizations: [
      {
        id: 'viz-1',
        datasetId: 'ds-1',
        dataDriven: true,
        fill: {
          column: 'taux_pauvrete',
          nature: 'ratio',
          missingCount: 0,
          missingShown: false,
          classes: {
            classes: 5,
            counts: [8, 8, 8, 8, 8],
            paletteFamily: 'sequential',
            colorblindSafePalette: false,
            hasBreakpoint: false
          }
        },
        legends: [{ visible: true, title: 'Taux de pauvreté (%)' }]
      }
    ]
  };
  const ids = (input: MapReviewInput) =>
    reviewMap(input).checks.map((check) => check.id);
  const withFill = (
    fill: Partial<NonNullable<MapReviewInput['visualizations'][0]['fill']>>
  ): MapReviewInput => ({
    ...READY_MAP,
    visualizations: [
      {
        ...READY_MAP.visualizations[0],
        fill: { ...READY_MAP.visualizations[0].fill!, ...fill }
      }
    ]
  });

  it('should find nothing to fix when a rate is classed, titled, sourced and its legend titled', () => {
    expect(reviewMap(READY_MAP)).toEqual({ ready: true, checks: [] });
  });

  it('should warn when a count is shown as a choropleth or a ratio as proportional symbols', () => {
    expect(ids(withFill({ column: 'population', nature: 'count' }))).toEqual([
      'count_as_choropleth'
    ]);
    expect(
      ids({
        ...READY_MAP,
        visualizations: [
          {
            id: 'viz-2',
            dataDriven: true,
            proportionalSymbols: { column: 'taux', nature: 'ratio' },
            legends: [{ visible: true, title: 'Taux' }]
          }
        ]
      })
    ).toEqual(['ratio_as_proportional_symbols']);
  });

  it('should warn when classes are empty or missing values are not shown', () => {
    const review = reviewMap(
      withFill({
        missingCount: 3,
        missingShown: false,
        classes: {
          ...READY_MAP.visualizations[0].fill!.classes!,
          counts: [10, 0, 10, 10, 10]
        }
      })
    );

    expect(review.ready).toBe(false);
    expect(review.checks.map((check) => check.id)).toEqual([
      'missing_values_hidden',
      'empty_classes'
    ]);
    expect(ids(withFill({ missingCount: 3, missingShown: true }))).toEqual([]);
  });

  it('should not warn about missing values when another layer of the same column shows them', () => {
    const classes = withFill({ missingCount: 3, missingShown: false })
      .visualizations[0];
    expect(
      ids({
        ...READY_MAP,
        visualizations: [
          classes,
          {
            ...classes,
            id: 'viz-missing',
            fill: { ...classes.fill!, missingShown: true }
          }
        ]
      })
    ).toEqual([]);
  });

  it('should only advise when the title or source sit in free texts and the palette needs a check', () => {
    const review = reviewMap({
      ...withFill({
        classes: {
          classes: 9,
          counts: [5, 5, 5, 5, 5, 5, 5, 5, 5],
          paletteFamily: 'diverging',
          colorblindSafePalette: false,
          hasBreakpoint: false
        }
      }),
      pageTitle: null,
      pageSource: null,
      freeTexts: ['Pauvreté en 2021', 'Source : Insee']
    });

    expect(review.ready).toBe(true);
    expect(review.checks.map((check) => check.id)).toEqual([
      'title_in_free_text',
      'many_classes',
      'diverging_without_breakpoint',
      'palette_outside_colorblind_set'
    ]);
  });

  it('should warn when the page has no title or source and a legend is hidden or untitled', () => {
    expect(
      ids({
        ...READY_MAP,
        pageTitle: null,
        pageSource: null,
        visualizations: [
          {
            ...READY_MAP.visualizations[0],
            legends: [{ visible: false, title: '' }]
          },
          {
            id: 'viz-3',
            dataDriven: true,
            legends: [{ visible: true, title: ' ' }]
          },
          {
            id: 'viz-4',
            dataDriven: false,
            legends: [{ visible: true, title: '' }]
          }
        ]
      })
    ).toEqual([
      'title_missing',
      'source_missing',
      'legend_hidden',
      'legend_title_missing'
    ]);
  });
});

describe('agent choropleth variable', () => {
  it('should refuse a count when a choropleth would class it', () => {
    expect(refuseForChoropleth('count')).not.toBeNull();
  });

  it('should accept a ratio or a calculated column the engine has not typed', () => {
    expect(refuseForChoropleth('ratio')).toBeNull();
    expect(refuseForChoropleth(undefined)).toBeNull();
  });
});
