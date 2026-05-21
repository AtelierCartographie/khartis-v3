import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarState, ToolbarStep } from '$lib/features/commons/types/global';
import LayoutProbe from './__fixtures__/layout-probe.svelte';

const FORMAT_WIDTH = 842;
const FORMAT_HEIGHT = 595;
const STEP_TOOLBAR = 80;
const WORKSPACE_HEIGHT = 900;

interface Scenario {
  label: string;
  windowWidth: number;
  workspaceWidth: number;
  toolbarState: ToolbarState;
  selectedStep: ToolbarStep;
}

function dataFull(windowWidth: number, fullWidth: number): Scenario {
  return {
    label: 'data full',
    windowWidth,
    workspaceWidth: windowWidth - fullWidth,
    toolbarState: ToolbarState.Full,
    selectedStep: ToolbarStep.Data
  };
}

function vizCompact(windowWidth: number): Scenario {
  return {
    label: 'visualizations compact',
    windowWidth,
    workspaceWidth: windowWidth - 434,
    toolbarState: ToolbarState.Compact,
    selectedStep: ToolbarStep.Visualizations
  };
}

function styling(windowWidth: number): Scenario {
  return {
    label: 'styling (toolbar hidden)',
    windowWidth,
    workspaceWidth: windowWidth,
    toolbarState: ToolbarState.Collapsed,
    selectedStep: ToolbarStep.Styling
  };
}

function readSnapshot(container: HTMLElement) {
  const page = container.querySelector('[data-testid="page"]');
  if (!(page instanceof HTMLElement)) throw new Error('probe page missing');
  return {
    fitScale: Number(page.dataset.fitScale),
    renderedWidth: Number(page.dataset.renderedWidth),
    renderedHeight: Number(page.dataset.renderedHeight),
    centering: Number(page.dataset.centering),
    transform: page.style.transform
  };
}

function probeProps(scenario: Scenario, onRender?: (s: object) => void) {
  return {
    windowWidth: scenario.windowWidth,
    isMobileView: false,
    toolbarState: scenario.toolbarState,
    selectedStep: scenario.selectedStep,
    workspaceWidth: scenario.workspaceWidth,
    workspaceHeight: WORKSPACE_HEIGHT,
    stepToolbarWidth: STEP_TOOLBAR,
    formatWidth: FORMAT_WIDTH,
    formatHeight: FORMAT_HEIGHT,
    onRender
  };
}

describe('layout runtime invariance', () => {
  for (const windowWidth of [1280, 1600, 1920, 2560]) {
    const fullWidth = Math.min(800, Math.max(400, windowWidth * 0.5));
    const scenarios: Scenario[] = [
      dataFull(windowWidth, fullWidth),
      vizCompact(windowWidth),
      styling(windowWidth)
    ];

    it(`keeps fitScale and rendered dimensions identical across step transitions at ${windowWidth}px`, async () => {
      const reference = scenarios[0];
      const { container, rerender } = render(
        LayoutProbe,
        probeProps(reference)
      );
      await tick();
      const initial = readSnapshot(container);

      for (let i = 1; i < scenarios.length; i += 1) {
        const next = scenarios[i];
        await rerender(probeProps(next));
        await tick();
        const snap = readSnapshot(container);
        expect(snap.fitScale, `${next.label} fitScale`).toBe(initial.fitScale);
        expect(snap.renderedWidth, `${next.label} renderedWidth`).toBe(
          initial.renderedWidth
        );
        expect(snap.renderedHeight, `${next.label} renderedHeight`).toBe(
          initial.renderedHeight
        );
      }
    });

    it(`keeps absolute page center identical across step transitions at ${windowWidth}px`, async () => {
      const reference = scenarios[0];
      const { container, rerender } = render(
        LayoutProbe,
        probeProps(reference)
      );
      await tick();
      const initial = readSnapshot(container);
      const referenceAbsoluteCenter =
        reference.workspaceWidth / 2 + initial.centering;

      for (let i = 1; i < scenarios.length; i += 1) {
        const next = scenarios[i];
        await rerender(probeProps(next));
        await tick();
        const snap = readSnapshot(container);
        const absoluteCenter = next.workspaceWidth / 2 + snap.centering;
        expect(absoluteCenter, `${next.label} absolute center`).toBe(
          referenceAbsoluteCenter
        );
      }
    });
  }

  it('does not invoke the onRender effect when stepping from visualizations to styling keeps fitScale identical', async () => {
    const windowWidth = 1920;
    const onRender = vi.fn();
    const { container, rerender } = render(
      LayoutProbe,
      probeProps(vizCompact(windowWidth), onRender)
    );
    await tick();

    const renderedScaleEffectCountAfterMount = onRender.mock.calls.filter(
      (call) => (call[0] as { fitScale: number }).fitScale !== undefined
    ).length;
    const initial = readSnapshot(container);

    await rerender(probeProps(styling(windowWidth), onRender));
    await tick();
    const after = readSnapshot(container);

    expect(after.fitScale).toBe(initial.fitScale);
    expect(after.renderedWidth).toBe(initial.renderedWidth);
    expect(after.renderedHeight).toBe(initial.renderedHeight);

    const finalCalls = onRender.mock.calls;
    const fitScaleChanges = finalCalls.filter((call, index) => {
      if (index === 0) return true;
      const prev = finalCalls[index - 1][0] as { fitScale: number };
      const current = call[0] as { fitScale: number };
      return current.fitScale !== prev.fitScale;
    }).length;

    expect(
      fitScaleChanges,
      'fitScale should only change once (on mount), never on step transition'
    ).toBe(1);
    expect(renderedScaleEffectCountAfterMount).toBeGreaterThanOrEqual(1);
  });

  it('honours mobile view: zero reserve, zero centering shift', async () => {
    const onRender = vi.fn();
    const { container } = render(LayoutProbe, {
      windowWidth: 768,
      isMobileView: true,
      toolbarState: ToolbarState.Compact,
      selectedStep: ToolbarStep.Visualizations,
      workspaceWidth: 768,
      workspaceHeight: 1024,
      stepToolbarWidth: 0,
      formatWidth: FORMAT_WIDTH,
      formatHeight: FORMAT_HEIGHT,
      onRender
    });
    await tick();

    const snap = readSnapshot(container);
    expect(snap.centering).toBe(0);
    expect(snap.fitScale).toBeGreaterThan(0);
  });
});
