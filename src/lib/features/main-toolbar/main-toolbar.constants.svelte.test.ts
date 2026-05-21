import { describe, expect, it } from 'vitest';
import {
  MAIN_TOOLBAR_COLLAPSED_WIDTH_PX,
  MAIN_TOOLBAR_COMPACT_WIDTH_PX,
  MAIN_TOOLBAR_FULL_MAX_WIDTH_PX,
  MAIN_TOOLBAR_FULL_MIN_WIDTH_PX,
  getMainToolbarActualWidthPx,
  getMainToolbarFullWidthPx,
  getMainToolbarMaxWidthPx
} from './main-toolbar.constants';
import { ToolbarState, ToolbarStep } from '$lib/features/commons/types/global';

describe('getMainToolbarFullWidthPx', () => {
  it('should clamp the width to the documented min when the window is narrow', () => {
    expect(getMainToolbarFullWidthPx(600)).toBe(MAIN_TOOLBAR_FULL_MIN_WIDTH_PX);
  });

  it('should return half of the window width within the clamp range', () => {
    expect(getMainToolbarFullWidthPx(1400)).toBe(700);
  });

  it('should clamp the width to the documented max for very wide windows', () => {
    expect(getMainToolbarFullWidthPx(4000)).toBe(
      MAIN_TOOLBAR_FULL_MAX_WIDTH_PX
    );
  });

  it('should fall back to the min when the window width is invalid', () => {
    expect(getMainToolbarFullWidthPx(0)).toBe(MAIN_TOOLBAR_FULL_MIN_WIDTH_PX);
    expect(getMainToolbarFullWidthPx(-100)).toBe(
      MAIN_TOOLBAR_FULL_MIN_WIDTH_PX
    );
  });
});

describe('getMainToolbarMaxWidthPx', () => {
  it('should return 0 on mobile regardless of window width', () => {
    expect(getMainToolbarMaxWidthPx(1920, true)).toBe(0);
  });

  it('should mirror the full-mode width on desktop', () => {
    expect(getMainToolbarMaxWidthPx(1920, false)).toBe(
      getMainToolbarFullWidthPx(1920)
    );
  });
});

describe('getMainToolbarActualWidthPx', () => {
  const windowWidth = 1920;

  it('should return 0 on mobile in every step', () => {
    for (const step of [
      ToolbarStep.Data,
      ToolbarStep.Visualizations,
      ToolbarStep.Styling
    ]) {
      expect(
        getMainToolbarActualWidthPx(
          ToolbarState.Compact,
          step,
          windowWidth,
          true
        )
      ).toBe(0);
    }
  });

  it('should return 0 in the styling step because the toolbar is hidden', () => {
    expect(
      getMainToolbarActualWidthPx(
        ToolbarState.Full,
        ToolbarStep.Styling,
        windowWidth,
        false
      )
    ).toBe(0);
    expect(
      getMainToolbarActualWidthPx(
        ToolbarState.Compact,
        ToolbarStep.Styling,
        windowWidth,
        false
      )
    ).toBe(0);
  });

  it('should return the full-mode width when toolbar is in full state', () => {
    expect(
      getMainToolbarActualWidthPx(
        ToolbarState.Full,
        ToolbarStep.Data,
        windowWidth,
        false
      )
    ).toBe(getMainToolbarFullWidthPx(windowWidth));
  });

  it('should return the compact width when toolbar is in compact state', () => {
    expect(
      getMainToolbarActualWidthPx(
        ToolbarState.Compact,
        ToolbarStep.Visualizations,
        windowWidth,
        false
      )
    ).toBe(MAIN_TOOLBAR_COMPACT_WIDTH_PX);
  });

  it('should return the collapsed width when toolbar is in collapsed state', () => {
    expect(
      getMainToolbarActualWidthPx(
        ToolbarState.Collapsed,
        ToolbarStep.Visualizations,
        windowWidth,
        false
      )
    ).toBe(MAIN_TOOLBAR_COLLAPSED_WIDTH_PX);
  });
});

describe('layout invariance across step transitions', () => {
  const stepToolbarWidth = 80;

  interface FitArea {
    reservedEnd: number;
    effectiveFitWidth: number;
    centeringOffsetX: number;
    absolutePageCenterX: number;
  }

  function computeFitArea(
    state: ToolbarState,
    step: ToolbarStep,
    windowWidth: number
  ): FitArea {
    const maxWidth = getMainToolbarMaxWidthPx(windowWidth, false);
    const actualWidth = getMainToolbarActualWidthPx(
      state,
      step,
      windowWidth,
      false
    );
    const reservedEnd = Math.max(0, maxWidth - actualWidth);
    const workspaceWidth = windowWidth - actualWidth;
    const effectiveFitWidth = workspaceWidth - stepToolbarWidth - reservedEnd;
    const centeringOffsetX = (stepToolbarWidth + actualWidth - maxWidth) / 2;
    const absolutePageCenterX = workspaceWidth / 2 + centeringOffsetX;
    return {
      reservedEnd,
      effectiveFitWidth,
      centeringOffsetX,
      absolutePageCenterX
    };
  }

  const SCENARIOS: Array<{
    label: string;
    state: ToolbarState;
    step: ToolbarStep;
  }> = [
    { label: 'data full', state: ToolbarState.Full, step: ToolbarStep.Data },
    {
      label: 'data compact',
      state: ToolbarState.Compact,
      step: ToolbarStep.Data
    },
    {
      label: 'data collapsed',
      state: ToolbarState.Collapsed,
      step: ToolbarStep.Data
    },
    {
      label: 'visualizations compact',
      state: ToolbarState.Compact,
      step: ToolbarStep.Visualizations
    },
    {
      label: 'visualizations collapsed',
      state: ToolbarState.Collapsed,
      step: ToolbarStep.Visualizations
    },
    {
      label: 'styling (toolbar hidden, collapsed remembered)',
      state: ToolbarState.Collapsed,
      step: ToolbarStep.Styling
    },
    {
      label: 'styling (toolbar hidden, compact remembered)',
      state: ToolbarState.Compact,
      step: ToolbarStep.Styling
    }
  ];

  for (const windowWidth of [1280, 1600, 1920, 2560]) {
    it(`should keep effective fit width identical across every scenario at window ${windowWidth}`, () => {
      const reference = computeFitArea(
        ToolbarState.Full,
        ToolbarStep.Data,
        windowWidth
      );
      for (const scenario of SCENARIOS) {
        const current = computeFitArea(
          scenario.state,
          scenario.step,
          windowWidth
        );
        expect(
          current.effectiveFitWidth,
          `${scenario.label} fit width differs`
        ).toBe(reference.effectiveFitWidth);
      }
    });

    it(`should keep absolute page center identical across every scenario at window ${windowWidth}`, () => {
      const reference = computeFitArea(
        ToolbarState.Full,
        ToolbarStep.Data,
        windowWidth
      );
      for (const scenario of SCENARIOS) {
        const current = computeFitArea(
          scenario.state,
          scenario.step,
          windowWidth
        );
        expect(
          current.absolutePageCenterX,
          `${scenario.label} center differs`
        ).toBe(reference.absolutePageCenterX);
      }
    });
  }

  it('should restore the legacy centering formula in data full mode (offset = stepToolbarWidth/2)', () => {
    const dataFull = computeFitArea(ToolbarState.Full, ToolbarStep.Data, 1920);
    expect(dataFull.centeringOffsetX).toBe(stepToolbarWidth / 2);
  });
});

describe('mobile adaptability', () => {
  const windowWidth = 768;

  it('should not reserve any toolbar space on mobile', () => {
    for (const state of [
      ToolbarState.Full,
      ToolbarState.Compact,
      ToolbarState.Collapsed
    ]) {
      for (const step of [
        ToolbarStep.Data,
        ToolbarStep.Visualizations,
        ToolbarStep.Styling
      ]) {
        const actual = getMainToolbarActualWidthPx(
          state,
          step,
          windowWidth,
          true
        );
        const max = getMainToolbarMaxWidthPx(windowWidth, true);
        expect(actual, `actual width for ${state}/${step}`).toBe(0);
        expect(max, `max width for ${state}/${step}`).toBe(0);
      }
    }
  });
});

describe('narrow desktop adaptability', () => {
  for (const windowWidth of [1024, 1100, 1200]) {
    it(`should clamp the full toolbar width to its minimum at window ${windowWidth}`, () => {
      const fullWidth = getMainToolbarFullWidthPx(windowWidth);
      expect(fullWidth).toBeGreaterThanOrEqual(MAIN_TOOLBAR_FULL_MIN_WIDTH_PX);
      expect(fullWidth).toBeLessThanOrEqual(MAIN_TOOLBAR_FULL_MAX_WIDTH_PX);
    });

    it(`should keep the data full toolbar within window bounds at ${windowWidth}`, () => {
      const actual = getMainToolbarActualWidthPx(
        ToolbarState.Full,
        ToolbarStep.Data,
        windowWidth,
        false
      );
      expect(actual).toBeLessThan(windowWidth);
    });
  }
});
