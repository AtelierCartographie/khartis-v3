import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../step-toolbar.constants';

const mockState = vi.hoisted(() => ({
  selectedTool: undefined as string | undefined
}));

const mockSelectTool = vi.hoisted(() => vi.fn());

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalState: mockState
}));

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    step_toolbar_tools: () => 'Tools',
    tool_search: () => 'Search',
    tool_layers: () => 'Layers',
    tool_projection: () => 'Projection',
    tool_simplification: () => 'Simplification',
    tool_facets: () => 'Facets'
  }
}));

vi.mock('$lib/features/step-toolbar/tools-list/tool-list.utils.svelte', () => ({
  selectTool: mockSelectTool
}));

import VisualizationTools from './visualization-tools.svelte';

afterEach(() => {
  cleanup();
  mockState.selectedTool = undefined;
  mockSelectTool.mockClear();
  localStorage.clear();
});

describe('visualization-tools notification badges', () => {
  describe('initial state', () => {
    it('shows badges for projection and facets on first load', () => {
      const { container } = render(VisualizationTools);

      const badges = container.querySelectorAll('.notification-badge');
      expect(badges).toHaveLength(2);
    });

    it('shows no badge when projection was previously opened', () => {
      localStorage.setItem(
        STORAGE_KEYS.PROJECTION_TOOL_OPENED,
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
      const { container } = render(VisualizationTools);

      const wrappers = container.querySelectorAll('.tool-button-wrapper');
      expect(wrappers[0].querySelector('.notification-badge')).toBeNull();
      expect(wrappers[1].querySelector('.notification-badge')).not.toBeNull();
    });

    it('shows no badge when facets was previously opened', () => {
      localStorage.setItem(
        STORAGE_KEYS.FACETS_TOOL_OPENED,
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
      const { container } = render(VisualizationTools);

      const wrappers = container.querySelectorAll('.tool-button-wrapper');
      expect(wrappers[0].querySelector('.notification-badge')).not.toBeNull();
      expect(wrappers[1].querySelector('.notification-badge')).toBeNull();
    });

    it('shows no badges when both tools were previously opened', () => {
      localStorage.setItem(
        STORAGE_KEYS.PROJECTION_TOOL_OPENED,
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
      localStorage.setItem(
        STORAGE_KEYS.FACETS_TOOL_OPENED,
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
      const { container } = render(VisualizationTools);

      const badges = container.querySelectorAll('.notification-badge');
      expect(badges).toHaveLength(0);
    });
  });

  describe('projection button interaction', () => {
    it('hides projection badge after clicking the projection button', async () => {
      const { container } = render(VisualizationTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Projection' }));

      const wrappers = container.querySelectorAll('.tool-button-wrapper');
      expect(wrappers[0].querySelector('.notification-badge')).toBeNull();
    });

    it('saves projection opened state to localStorage on click', async () => {
      render(VisualizationTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Projection' }));

      expect(localStorage.getItem(STORAGE_KEYS.PROJECTION_TOOL_OPENED)).toBe(
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
    });

    it('calls selectTool with projection value on click', async () => {
      render(VisualizationTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Projection' }));

      expect(mockSelectTool).toHaveBeenCalledWith('projection');
    });
  });

  describe('facets button interaction', () => {
    it('hides facets badge after clicking the facets button', async () => {
      const { container } = render(VisualizationTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Facets' }));

      const wrappers = container.querySelectorAll('.tool-button-wrapper');
      expect(wrappers[1].querySelector('.notification-badge')).toBeNull();
    });

    it('saves facets opened state to localStorage on click', async () => {
      render(VisualizationTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Facets' }));

      expect(localStorage.getItem(STORAGE_KEYS.FACETS_TOOL_OPENED)).toBe(
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
    });

    it('calls selectTool with facets value on click', async () => {
      render(VisualizationTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Facets' }));

      expect(mockSelectTool).toHaveBeenCalledWith('facets');
    });
  });
});
