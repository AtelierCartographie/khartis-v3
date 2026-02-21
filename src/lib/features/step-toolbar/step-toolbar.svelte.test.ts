import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSS_CLASSES, TEST_IDS } from './step-toolbar.constants';

const mockState = vi.hoisted(() => ({
  selectedStep: undefined as string | undefined,
  selectedTool: undefined as string | undefined,
  projectionViewMode: undefined as string | undefined
}));

const mockGlobalActions = vi.hoisted(() => ({
  setNavigationState: vi.fn()
}));

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalState: mockState,
  globalActions: mockGlobalActions
}));

vi.mock('$lib/paraglide/messages.js', () => ({
  m: {
    step_toolbar_steps: () => 'Steps',
    step_data: () => 'Data',
    step_visualizations: () => 'Visualizations',
    step_styling: () => 'Styling',
    toolbar_nav_aria: () => 'Tools and visualizations',
    toolbar_step_selection_aria: () => 'Select a step to continue',
    step_data_aria: () => 'Select Data step',
    step_visualizations_aria: () => 'Select Visualizations step',
    step_styling_aria: () => 'Select Styling step'
  }
}));

vi.mock('./tools-list/visualization-tools.svelte', () => ({
  default: () => {}
}));
vi.mock('./tools-list/styling-tools.svelte', () => ({
  default: () => {}
}));
vi.mock('./tools/tool-container.svelte', () => ({
  default: () => {}
}));
vi.mock('./tool-popover.svelte', () => ({
  default: () => {}
}));

import StepToolbar from './step-toolbar.svelte';

afterEach(() => {
  cleanup();
  mockState.selectedStep = undefined;
  mockState.selectedTool = undefined;
  mockGlobalActions.setNavigationState.mockClear();
});

describe('StepToolbar — accessibility', () => {
  describe('nav element', () => {
    it('renders a <nav> element', () => {
      const { container } = render(StepToolbar);
      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('nav has aria-label for landmark identification', () => {
      const { container } = render(StepToolbar);
      const nav = container.querySelector('nav');
      expect(nav?.getAttribute('aria-label')).toBe('Tools and visualizations');
    });
  });

  describe('step container', () => {
    it('step container has role="group"', () => {
      const { container } = render(StepToolbar);
      const group = container.querySelector(`[role="group"]`);
      expect(group).toBeInTheDocument();
    });

    it('step container has aria-label', () => {
      const { container } = render(StepToolbar);
      const group = container.querySelector(`[role="group"]`);
      expect(group?.getAttribute('aria-label')).toBe(
        'Select a step to continue'
      );
    });
  });

  describe('step buttons — aria-label', () => {
    it('data button has correct aria-label', () => {
      const { container } = render(StepToolbar);
      const btn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_DATA}"]`
      );
      expect(btn?.getAttribute('aria-label')).toBe('Select Data step');
    });

    it('visualizations button has correct aria-label', () => {
      const { container } = render(StepToolbar);
      const btn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_VISUALIZATIONS}"]`
      );
      expect(btn?.getAttribute('aria-label')).toBe(
        'Select Visualizations step'
      );
    });

    it('styling button has correct aria-label', () => {
      const { container } = render(StepToolbar);
      const btn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_STYLING}"]`
      );
      expect(btn?.getAttribute('aria-label')).toBe('Select Styling step');
    });
  });

  describe('step buttons — aria-pressed', () => {
    it('data button has aria-pressed="false" when not selected', () => {
      mockState.selectedStep = undefined;
      const { container } = render(StepToolbar);
      const btn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_DATA}"]`
      );
      expect(btn?.getAttribute('aria-pressed')).toBe('false');
    });

    it('data button has aria-pressed="true" when selected', () => {
      mockState.selectedStep = 'data';
      const { container } = render(StepToolbar);
      const btn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_DATA}"]`
      );
      expect(btn?.getAttribute('aria-pressed')).toBe('true');
    });

    it('visualizations button has aria-pressed="true" when selected', () => {
      mockState.selectedStep = 'visualizations';
      const { container } = render(StepToolbar);
      const btn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_VISUALIZATIONS}"]`
      );
      expect(btn?.getAttribute('aria-pressed')).toBe('true');
    });

    it('only the selected step button has aria-pressed="true"', () => {
      mockState.selectedStep = 'styling';
      const { container } = render(StepToolbar);

      const dataBtn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_DATA}"]`
      );
      const vizBtn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_VISUALIZATIONS}"]`
      );
      const stylingBtn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_STYLING}"]`
      );

      expect(dataBtn?.getAttribute('aria-pressed')).toBe('false');
      expect(vizBtn?.getAttribute('aria-pressed')).toBe('false');
      expect(stylingBtn?.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('step buttons — keyboard accessibility', () => {
    it('all step buttons are native <button> elements (keyboard accessible)', () => {
      const { container } = render(StepToolbar);
      const buttons = container.querySelectorAll(`.${CSS_CLASSES.NAV_ITEM}`);
      expect(buttons).toHaveLength(3);
      buttons.forEach((btn) => {
        expect(btn.tagName.toLowerCase()).toBe('button');
      });
    });
  });

  describe('selected visual state', () => {
    it('selected button has the selected CSS class', () => {
      mockState.selectedStep = 'visualizations';
      const { container } = render(StepToolbar);
      const vizBtn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_VISUALIZATIONS}"]`
      );
      expect(vizBtn?.classList.contains(CSS_CLASSES.SELECTED)).toBe(true);
    });

    it('unselected buttons do not have the selected CSS class', () => {
      mockState.selectedStep = 'visualizations';
      const { container } = render(StepToolbar);
      const dataBtn = container.querySelector(
        `[data-testid="${TEST_IDS.STEP_DATA}"]`
      );
      expect(dataBtn?.classList.contains(CSS_CLASSES.SELECTED)).toBe(false);
    });
  });
});
