import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import VisualizationSuggestionCard from './visualization-suggestion-card.svelte';
import * as m from '$lib/paraglide/messages';

function createSuggestion(
  overrides: Partial<VizSuggestion> = {}
): VizSuggestion {
  return {
    id: 'lines_colorful_QL',
    label: 'Lignes colorées (qualitatif)',
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['line'],
    columns: ['li_type'],
    score: 98,
    ...overrides
  };
}

describe('VisualizationSuggestionCard', () => {
  it('invokes the explicit activate callback when the card is clicked', async () => {
    const activate = vi.fn();
    const { getAllByRole } = render(VisualizationSuggestionCard, {
      suggestion: createSuggestion(),
      resolveBadgeType: () => 'string',
      activate
    });

    await fireEvent.click(getAllByRole('radio')[0]);

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('keeps the onclick callback as a backward-compatible fallback', async () => {
    const onclick = vi.fn();
    const { getAllByRole } = render(VisualizationSuggestionCard, {
      suggestion: createSuggestion(),
      resolveBadgeType: () => 'string',
      onclick
    });

    await fireEvent.click(getAllByRole('radio')[0]);

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('renders every variable and representation type for hybrid suggestions', () => {
    render(VisualizationSuggestionCard, {
      suggestion: createSuggestion({
        label: 'Symboles proportionnels avec fond en classes',
        nbColumns: 3,
        semioTypes: ['QTA', 'QTR', 'QL'],
        geometries: ['point', 'polygon'],
        columns: ['population', 'density_class', 'region_name']
      }),
      resolveBadgeType: () => 'numeric'
    });

    expect(screen.getByText('population')).toBeInTheDocument();
    expect(screen.getByText('density_class')).toBeInTheDocument();
    expect(screen.getByText('region_name')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  // One case per distinct display rule the card must follow, mirroring the
  // "Résultat souhaité" spec (issue #184) across every suggestion family that
  // the suggester can actually surface.
  const SEMIO_CASES: Array<{
    name: string;
    suggestion: Partial<VizSuggestion>;
    primitive: string;
    types: string[];
    badges: string[];
  }> = [
    {
      name: 'Symboles · uniques (no variable)',
      suggestion: {
        id: 'symbols_uniques',
        nbColumns: 0,
        semioTypes: [],
        geometries: ['point', 'polygon'],
        columns: [],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_symbols(),
      types: [m.viz_suggestion_mode_unique()],
      badges: []
    },
    {
      name: 'Symboles · proportionnels',
      suggestion: {
        id: 'symbols_proportional',
        nbColumns: 1,
        semioTypes: ['QTA'],
        geometries: ['point', 'polygon'],
        columns: ['pop'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_symbols(),
      types: [m.viz_suggestion_mode_proportional()],
      badges: ['pop']
    },
    {
      name: 'Symboles · proportionnels + fond en catégories (polygon data)',
      suggestion: {
        id: 'symbols_proportional_colorful_QL',
        nbColumns: 2,
        semioTypes: ['QTA', 'QL'],
        geometries: ['point', 'polygon'],
        columns: ['pop', 'zone'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_symbols(),
      types: [
        m.viz_suggestion_mode_proportional(),
        m.viz_suggestion_mode_fond_categories()
      ],
      badges: ['pop', 'zone']
    },
    {
      name: 'Symboles · proportionnels + fond en classes (polygon data)',
      suggestion: {
        id: 'symbols_proportional_colorful_QTR',
        nbColumns: 2,
        semioTypes: ['QTA', 'QTR'],
        geometries: ['point', 'polygon'],
        columns: ['pop', 'density'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_symbols(),
      types: [
        m.viz_suggestion_mode_proportional(),
        m.viz_suggestion_mode_fond_classes()
      ],
      badges: ['pop', 'density']
    },
    {
      name: 'Symboles · uniques + fond en catégories (polygon, no size variable)',
      suggestion: {
        id: 'symbols_uniques_colorful_QL',
        nbColumns: 1,
        semioTypes: ['QL'],
        geometries: ['point', 'polygon'],
        columns: ['zone'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_symbols(),
      types: [
        m.viz_suggestion_mode_unique(),
        m.viz_suggestion_mode_fond_categories()
      ],
      badges: ['zone']
    },
    {
      name: 'Symboles on point data → colour is not a fond',
      suggestion: {
        id: 'symbols_proportional_colorful_QL',
        nbColumns: 2,
        semioTypes: ['QTA', 'QL'],
        geometries: ['point', 'polygon'],
        columns: ['pop', 'zone'],
        dataGeometry: 'point'
      },
      primitive: m.viz_suggestion_primitive_symbols(),
      types: [
        m.viz_suggestion_mode_proportional(),
        m.viz_suggestion_mode_categories()
      ],
      badges: ['pop', 'zone']
    },
    {
      name: 'Polygones · en catégories',
      suggestion: {
        id: 'polygons_colorful_QL',
        nbColumns: 1,
        semioTypes: ['QL'],
        geometries: ['polygon'],
        columns: ['zone'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_polygons(),
      types: [m.viz_suggestion_mode_categories()],
      badges: ['zone']
    },
    {
      name: 'Polygones · en classes (choropleth)',
      suggestion: {
        id: 'choropleth',
        nbColumns: 1,
        semioTypes: ['QTR'],
        geometries: ['polygon'],
        columns: ['rate'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_polygons(),
      types: [m.viz_suggestion_mode_classes()],
      badges: ['rate']
    },
    {
      name: 'Polygones · uniques (no variable)',
      suggestion: {
        id: 'polygons_uniques',
        nbColumns: 0,
        semioTypes: [],
        geometries: ['polygon'],
        columns: [],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_polygons(),
      types: [m.viz_suggestion_mode_unique()],
      badges: []
    },
    {
      name: 'Lignes · proportionnels',
      suggestion: {
        id: 'lines_proportional',
        nbColumns: 1,
        semioTypes: ['QTA'],
        geometries: ['line'],
        columns: ['flow'],
        dataGeometry: 'line'
      },
      primitive: m.viz_suggestion_primitive_lines(),
      types: [m.viz_suggestion_mode_proportional()],
      badges: ['flow']
    },
    {
      name: 'Lignes · en classes (lines never use a fond)',
      suggestion: {
        id: 'lines_colorful_QTR',
        nbColumns: 1,
        semioTypes: ['QTR'],
        geometries: ['line'],
        columns: ['rate'],
        dataGeometry: 'line'
      },
      primitive: m.viz_suggestion_primitive_lines(),
      types: [m.viz_suggestion_mode_classes()],
      badges: ['rate']
    },
    {
      name: 'Textes · label column without type + proportionnels',
      suggestion: {
        id: 'texts_proportional',
        nbColumns: 2,
        semioTypes: ['QL', 'QTA'],
        geometries: ['point', 'polygon'],
        columns: ['nom_departement', 'naissances'],
        dataGeometry: 'polygon'
      },
      primitive: m.viz_suggestion_primitive_texts(),
      types: [m.viz_suggestion_mode_proportional()],
      badges: ['nom_departement', 'naissances']
    }
  ];

  const NUMERIC_COLUMNS = new Set([
    'pop',
    'area',
    'flow',
    'rate',
    'density',
    'naissances'
  ]);

  it.each(SEMIO_CASES)(
    'renders $name as primitive → type → variable',
    ({ suggestion, primitive, types, badges }) => {
      const { container } = render(VisualizationSuggestionCard, {
        suggestion: createSuggestion(suggestion),
        resolveBadgeType: (column: string) =>
          NUMERIC_COLUMNS.has(column) ? 'numeric' : 'string'
      });

      expect(container.querySelector('.title')?.textContent?.trim()).toBe(
        primitive
      );
      expect(
        [...container.querySelectorAll('.type-label')].map((el) =>
          el.textContent?.trim()
        )
      ).toEqual(types);
      expect(
        [...container.querySelectorAll('.badge-label')].map((el) =>
          el.textContent?.trim()
        )
      ).toEqual(badges);
    }
  );
});
