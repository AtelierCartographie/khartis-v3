import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import VisualizationSuggestionPreview from './visualization-suggestion-preview.svelte';
import type {
  SemioType,
  SimplifiedGeometryType
} from '$lib/features/commons/services/viz-suggester.service';

type PreviewExample = {
  name: string;
  suggestionId: string;
  semioTypes: SemioType[];
  geometries: SimplifiedGeometryType[];
  expectedClass: string;
  expectedSelector: string;
};

const PREVIEW_EXAMPLES: PreviewExample[] = [
  {
    name: 'proportional symbols',
    suggestionId: 'symbols_proportional_QTA',
    semioTypes: ['QTA'],
    geometries: ['point', 'polygon'],
    expectedClass: 'viz-preview--symbol',
    expectedSelector: '.symbol-layer circle'
  },
  {
    name: 'choropleth polygons',
    suggestionId: 'polygons_choropleth_QTR',
    semioTypes: ['QTR'],
    geometries: ['polygon'],
    expectedClass: 'viz-preview--polygon',
    expectedSelector: '.polygon-layer path'
  },
  {
    name: 'colorful lines',
    suggestionId: 'lines_colorful_QL',
    semioTypes: ['QL'],
    geometries: ['line'],
    expectedClass: 'viz-preview--line',
    expectedSelector: '.line-layer path'
  },
  {
    name: 'text labels',
    suggestionId: 'texts_simple_QL',
    semioTypes: ['QL'],
    geometries: ['point'],
    expectedClass: 'viz-preview--text',
    expectedSelector: '.text-layer text'
  },
  {
    name: 'different double symbols',
    suggestionId: 'symbols_differents_double_QTA_QL',
    semioTypes: ['QTA', 'QL'],
    geometries: ['point'],
    expectedClass: 'viz-preview--double',
    expectedSelector: '.second-variable circle'
  }
];

describe('VisualizationSuggestionPreview', () => {
  it.each(PREVIEW_EXAMPLES)(
    'renders a distinct static SVG preview for $name',
    ({
      suggestionId,
      semioTypes,
      geometries,
      expectedClass,
      expectedSelector
    }) => {
      const { container } = render(VisualizationSuggestionPreview, {
        suggestionId,
        label: 'Preview',
        semioTypes,
        geometries
      });

      const svg = container.querySelector(
        'svg.visualization-suggestion-preview'
      );

      expect(svg).not.toBeNull();
      expect(svg).toHaveClass(expectedClass);
      expect(svg).toHaveAttribute('role', 'img');
      expect(svg).toHaveAttribute('aria-label', 'Preview');
      expect(
        container.querySelectorAll(expectedSelector).length
      ).toBeGreaterThan(0);
    }
  );
});
