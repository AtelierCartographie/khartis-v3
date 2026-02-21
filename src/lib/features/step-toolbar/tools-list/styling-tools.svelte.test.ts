import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  selectedTool: undefined as string | undefined
}));

const mockLegendState = vi.hoisted(() => ({ hasBeenOpened: false }));
const mockMarkAsOpened = vi.hoisted(() => vi.fn());
const mockSelectTool = vi.hoisted(() => vi.fn());
const mockInitPageElements = vi.hoisted(() => vi.fn());

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalState: mockState
}));

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    step_toolbar_tools: () => 'Tools',
    tool_format: () => 'Format',
    tool_legend: () => 'Legend',
    tool_geo_indications: () => 'Geo indications',
    tool_annotations: () => 'Annotations',
    tool_color_blindness: () => 'Color blindness'
  }
}));

vi.mock('$lib/features/step-toolbar/tools/legend/legend.store.svelte', () => ({
  getLegendState: () => mockLegendState,
  legendActions: {
    markAsOpened: mockMarkAsOpened
  }
}));

vi.mock(
  '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte',
  () => ({
    annotationsActions: {
      initPageElements: mockInitPageElements
    }
  })
);

vi.mock('$lib/features/step-toolbar/tools-list/tool-list.utils.svelte', () => ({
  selectTool: mockSelectTool
}));

import StylingTools from './styling-tools.svelte';

afterEach(() => {
  cleanup();
  mockState.selectedTool = undefined;
  mockSelectTool.mockClear();
  mockMarkAsOpened.mockClear();
  mockInitPageElements.mockClear();
  mockLegendState.hasBeenOpened = false;
});

describe('styling-tools legend notification badge', () => {
  describe('initial state', () => {
    it('shows legend badge when legend has never been opened', () => {
      mockLegendState.hasBeenOpened = false;
      const { container } = render(StylingTools);

      const badge = container.querySelector('.notification-badge');
      expect(badge).not.toBeNull();
    });

    it('does not show legend badge when legend has already been opened', () => {
      mockLegendState.hasBeenOpened = true;
      const { container } = render(StylingTools);

      const badge = container.querySelector('.notification-badge');
      expect(badge).toBeNull();
    });
  });

  describe('legend button interaction', () => {
    it('calls legendActions.markAsOpened when legend button is clicked', async () => {
      mockLegendState.hasBeenOpened = false;
      render(StylingTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Legend' }));

      expect(mockMarkAsOpened).toHaveBeenCalledOnce();
    });

    it('calls selectTool with legend value when legend button is clicked', async () => {
      render(StylingTools);

      await fireEvent.click(screen.getByRole('button', { name: 'Legend' }));

      expect(mockSelectTool).toHaveBeenCalledWith('legend');
    });
  });
});
