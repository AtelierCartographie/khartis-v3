import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  selectedTool: undefined as string | undefined
}));

const mockSelectTool = vi.hoisted(() => vi.fn());

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalState: mockState
}));

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    close: () => 'Close',
    tool_search: () => 'Search',
    tool_layers: () => 'Layers',
    tool_projection: () => 'Projection',
    tool_simplification: () => 'Simplification',
    tool_facets: () => 'Facets',
    tool_annotations: () => 'Annotations',
    tool_format: () => 'Format',
    tool_legend: () => 'Legend',
    tool_geo_indications: () => 'Geo indications',
    tool_color_blindness: () => 'Color blindness'
  }
}));

vi.mock('$lib/features/step-toolbar/tools-list/tool-list.utils.svelte', () => ({
  selectTool: mockSelectTool
}));

vi.mock('./annotations/annotations.svelte', () => ({ default: undefined }));
vi.mock('./color-blindness/color-blindness.svelte', () => ({
  default: undefined
}));
vi.mock('./facets/facets.svelte', () => ({ default: undefined }));
vi.mock('./format/format.svelte', () => ({ default: undefined }));
vi.mock('./geo-indications/geo-indications.svelte', () => ({
  default: undefined
}));
vi.mock('./layers/layers.svelte', () => ({ default: undefined }));
vi.mock('./legend/legend.svelte', () => ({ default: undefined }));
vi.mock('./projections/projection.svelte', () => ({ default: undefined }));
vi.mock('./search/search.svelte', () => ({ default: undefined }));
vi.mock('./simplification/simplification.svelte', () => ({
  default: undefined
}));

import ToolContainer from './tool-container.svelte';

afterEach(() => {
  cleanup();
  mockState.selectedTool = undefined;
  mockSelectTool.mockClear();
});

describe('ToolContainer', () => {
  describe('header structure', () => {
    it('renders the header with a p.tool-title element', () => {
      mockState.selectedTool = 'search';
      const { container } = render(ToolContainer);

      const title = container.querySelector('p.tool-title');
      expect(title).toBeInTheDocument();
    });

    it('renders a ghost close button', () => {
      mockState.selectedTool = 'search';
      render(ToolContainer);

      const closeBtn = screen.getByRole('button', { name: 'Close' });
      expect(closeBtn).toBeInTheDocument();
    });

    it('renders the header inside an aside element', () => {
      mockState.selectedTool = 'search';
      const { container } = render(ToolContainer);

      expect(container.querySelector('aside')).toBeInTheDocument();
      expect(container.querySelector('aside header')).toBeInTheDocument();
    });
  });

  describe('title text per tool', () => {
    it.each([
      ['search', 'Search'],
      ['layers', 'Layers'],
      ['projection', 'Projection'],
      ['simplification', 'Simplification'],
      ['facets', 'Facets'],
      ['annotations', 'Annotations'],
      ['format', 'Format'],
      ['legend', 'Legend'],
      ['geo-indications', 'Geo indications'],
      ['color-blindness', 'Color blindness']
    ])('shows "%s" title for tool "%s"', (tool, expectedTitle) => {
      mockState.selectedTool = tool;
      const { container } = render(ToolContainer);

      expect(container.querySelector('p.tool-title')?.textContent).toBe(
        expectedTitle
      );
    });
  });

  describe('empty state', () => {
    it('shows empty title when no tool is selected', () => {
      mockState.selectedTool = undefined;
      const { container } = render(ToolContainer);

      expect(container.querySelector('p.tool-title')?.textContent).toBe('');
    });
  });

  describe('close button interaction', () => {
    it('calls selectTool(undefined) when close is clicked', async () => {
      mockState.selectedTool = 'search';
      render(ToolContainer);

      const closeBtn = screen.getByRole('button', { name: 'Close' });
      await fireEvent.click(closeBtn);

      expect(mockSelectTool).toHaveBeenCalledWith(undefined);
    });
  });
});
