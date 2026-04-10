import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    DATE: 'date',
    STRING: 'string'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    VISUALIZATION: 'VISUALIZATION'
  },
  logger: {
    debug: vi.fn()
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  viz_suggestion_symbols_uniques: () => 'Symboles uniques',
  viz_suggestion_polygons_colorful_ql: () => 'Aplats de couleur (qualitatif)',
  viz_suggestion_choropleth: () => 'Choroplèthe',
  viz_suggestion_symbols_unique_colorful_qtr: () =>
    'Symboles uniques colorés (quantitatif)',
  viz_suggestion_symbols_different_ql: () => 'Symboles différents (qualitatif)',
  viz_suggestion_symbols_unique_colorful_ql: () =>
    'Symboles colorés (qualitatif)',
  viz_suggestion_symbols_proportional: () => 'Symboles proportionnels',
  viz_suggestion_symbols_proportional_colorful_ql: () =>
    'Symboles proportionnels colorés (qualitatif)',
  viz_suggestion_symbols_proportional_colorful_qtr: () =>
    'Symboles proportionnels colorés (quantitatif)',
  viz_suggestion_symbols_proportional_double: () =>
    'Double symboles proportionnels',
  viz_suggestion_polygons_unique: () => 'Polygones uniques',
  viz_suggestion_lines_unique: () => 'Lignes uniques',
  viz_suggestion_lines_colorful_ql: () => 'Lignes colorées (qualitatif)',
  viz_suggestion_lines_colorful_qtr: () => 'Lignes colorées (quantitatif)',
  viz_suggestion_lines_proportional: () => 'Lignes proportionnelles',
  viz_suggestion_lines_proportional_colorful_ql: () =>
    'Lignes proportionnelles colorées (qualitatif)',
  viz_suggestion_lines_proportional_colorful_qtr: () =>
    'Lignes proportionnelles colorées (quantitatif)',
  viz_suggestion_polygons_colorful_qlo: () =>
    'Aplats de couleur (qualitatif ordonné)',
  viz_suggestion_symbols_different_qlo: () =>
    'Symboles différents (qualitatif ordonné)',
  viz_suggestion_symbols_unique_colorful_qlo: () =>
    'Symboles colorés (qualitatif ordonné)',
  viz_suggestion_lines_colorful_qlo: () =>
    'Lignes colorées (qualitatif ordonné)',
  viz_suggestion_texts_colorful_ql: () => 'Textes colorés (qualitatif)',
  viz_suggestion_texts_colorful_qtr: () => 'Textes colorés (quantitatif)',
  viz_suggestion_texts_proportional: () => 'Textes proportionnels'
}));

import type { ColumnAnalysis } from '$lib/features/data-pipeline';
import { vizSuggester } from '$lib/features/commons/services/viz-suggester.service';

function makeColumn(
  name: string,
  type: string,
  stats: ColumnAnalysis['stats']
): ColumnAnalysis {
  return {
    name,
    type,
    stats
  };
}

describe('vizSuggester', () => {
  it('ignores technical identifier columns when ranking point suggestions', () => {
    const suggestions = vizSuggester.suggestVisualizations(
      [
        makeColumn('OGC_FID', 'number', {
          count: 180,
          uniques: 180,
          nulls: 0,
          min: 1,
          max: 180,
          share_integers: 1,
          share_floats: 0,
          share_rank_interval: 1,
          extent_magnitude: 2.2
        }),
        makeColumn('acces_pmr', 'string', {
          count: 180,
          uniques: 3,
          nulls: 0
        }),
        makeColumn('nom_arret', 'string', {
          count: 180,
          uniques: 170,
          nulls: 0
        })
      ],
      'Point',
      { maxSuggestions: 3 }
    );

    expect(
      suggestions.some((suggestion) => suggestion.columns?.includes('OGC_FID'))
    ).toBe(false);
    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      'symbols_uniques_colorful_QL'
    ]);
  });

  it('treats common GIS id columns as geoid candidates', () => {
    const suggestions = vizSuggester.suggestVisualizations(
      [
        makeColumn('OBJECTID', 'number', {
          count: 24,
          uniques: 24,
          nulls: 0,
          min: 1,
          max: 24,
          share_integers: 1,
          share_floats: 0,
          share_rank_interval: 1,
          extent_magnitude: 1.4
        }),
        makeColumn('STATUS', 'string', {
          count: 24,
          uniques: 4,
          nulls: 0
        })
      ],
      'Point',
      { maxSuggestions: 3 }
    );

    expect(
      suggestions.every((suggestion) =>
        suggestion.columns?.every((column) => column !== 'OBJECTID')
      )
    ).toBe(true);
    expect(suggestions.map((suggestion) => suggestion.id)).toContain(
      'symbols_uniques_colorful_QL'
    );
    expect(suggestions.map((suggestion) => suggestion.id)).not.toContain(
      'symbols_differents'
    );
  });

  it('uses a label-like column for text suggestions on moderate point datasets', () => {
    const suggestions = vizSuggester.suggestVisualizations(
      [
        makeColumn("Nom de l'installation", 'string', {
          count: 96,
          uniques: 96,
          nulls: 0
        }),
        makeColumn('Statut Seveso', 'string', {
          count: 96,
          uniques: 2,
          nulls: 0
        }),
        makeColumn('Latitude', 'number', {
          count: 96,
          uniques: 96,
          nulls: 0,
          min: 48.3,
          max: 49.2,
          share_integers: 0,
          share_floats: 1,
          share_rank_interval: 0,
          extent_magnitude: 0.1
        })
      ],
      'Point',
      { maxSuggestions: 12 }
    );

    const textSuggestion = suggestions.find(
      (suggestion) => suggestion.id === 'texts_colorful_QL'
    );

    expect(textSuggestion?.columns).toEqual([
      "Nom de l'installation",
      'Statut Seveso'
    ]);
  });

  it('dedupes polygon suggestions that collapse to the same current preset', () => {
    const suggestions = vizSuggester.suggestVisualizations(
      [
        makeColumn('country_name', 'string', {
          count: 120,
          uniques: 120,
          nulls: 0
        }),
        makeColumn('status', 'string', {
          count: 120,
          uniques: 5,
          nulls: 0
        }),
        makeColumn('population_ratio', 'number', {
          count: 120,
          uniques: 120,
          nulls: 0,
          min: 0.1,
          max: 98.4,
          share_integers: 0,
          share_floats: 1,
          share_rank_interval: 0,
          extent_magnitude: 2.9
        })
      ],
      'Polygon',
      { maxSuggestions: 12 }
    );

    expect(suggestions.map((suggestion) => suggestion.id)).toContain(
      'choropleth'
    );
    expect(suggestions.map((suggestion) => suggestion.id)).not.toContain(
      'symbols_uniques_colorful_QTR'
    );
    expect(suggestions.map((suggestion) => suggestion.id)).not.toContain(
      'symbols_differents'
    );
  });

  it('prefers proportional suggestions for unique numeric values that are not ids', () => {
    const suggestions = vizSuggester.suggestVisualizations(
      [
        makeColumn('code_region_2016', 'number', {
          count: 18,
          uniques: 18,
          nulls: 0,
          min: 1,
          max: 94,
          share_integers: 1,
          share_floats: 0,
          share_rank_interval: 0.06,
          extent_magnitude: 2
        }),
        makeColumn('valeur_test', 'number', {
          count: 18,
          uniques: 18,
          nulls: 0,
          min: 7,
          max: 42,
          share_integers: 1,
          share_floats: 0,
          share_rank_interval: 0.47,
          extent_magnitude: 1
        }),
        makeColumn('nom_region', 'string', {
          count: 18,
          uniques: 18,
          nulls: 0
        })
      ],
      'Polygon',
      { maxSuggestions: 6 }
    );

    expect(suggestions.map((suggestion) => suggestion.id)).toContain(
      'symbols_proportional'
    );
    expect(
      ['symbols_proportional', 'texts_proportional'].includes(
        suggestions[0]?.id ?? ''
      )
    ).toBe(true);
    expect(suggestions[0]?.columns).toContain('valeur_test');
  });

  it('orders polygon suggestions by descending score before family preference', () => {
    const suggestions = vizSuggester.suggestVisualizations(
      [
        makeColumn('country_name', 'string', {
          count: 81,
          uniques: 81,
          nulls: 0
        }),
        makeColumn('absolute_value', 'number', {
          count: 81,
          uniques: 81,
          nulls: 0,
          min: 1,
          max: 9000,
          share_integers: 1,
          share_floats: 0,
          share_rank_interval: 0.52,
          extent_magnitude: 4
        }),
        makeColumn('relative_value', 'number', {
          count: 81,
          uniques: 81,
          nulls: 0,
          min: 0.01,
          max: 21.33,
          share_integers: 0,
          share_floats: 1,
          share_rank_interval: 0,
          extent_magnitude: 1.4
        })
      ],
      'Polygon',
      { maxSuggestions: 6 }
    );

    const highestScore = Math.max(
      ...suggestions.map((suggestion) => suggestion.score ?? 0)
    );

    expect(suggestions[0]?.score).toBe(highestScore);
    expect(suggestions[0]?.id).toBe('symbols_proportional');
  });
});
