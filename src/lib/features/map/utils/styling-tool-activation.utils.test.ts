import { StylingTools, ToolbarStep } from '$lib/features/commons/types/global';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setNavigationState = vi.fn();
const openMobileToolbar = vi.fn();
const mockedGlobalState = {
  selectedStep: ToolbarStep.Data,
  selectedTool: undefined as StylingTools | undefined,
  isMobileView: false
};

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalActions: {
    setNavigationState,
    openMobileToolbar
  },
  globalState: mockedGlobalState
}));

const { activateStylingToolFromMap } =
  await import('./styling-tool-activation.utils');

describe('activateStylingToolFromMap', () => {
  beforeEach(() => {
    mockedGlobalState.selectedTool = undefined;
    mockedGlobalState.selectedStep = ToolbarStep.Data;
    mockedGlobalState.isMobileView = false;
    setNavigationState.mockReset();
    openMobileToolbar.mockReset();
  });

  it('switches to styling step and opens the requested tool', () => {
    activateStylingToolFromMap(StylingTools.Annotations);

    expect(setNavigationState).toHaveBeenCalledWith(ToolbarStep.Styling);
    expect(openMobileToolbar).not.toHaveBeenCalled();
    expect(mockedGlobalState.selectedTool).toBe(StylingTools.Annotations);
  });

  it('opens mobile toolbar when activating from mobile', () => {
    mockedGlobalState.isMobileView = true;

    activateStylingToolFromMap(StylingTools.GeoIndications);

    expect(setNavigationState).toHaveBeenCalledWith(ToolbarStep.Styling);
    expect(openMobileToolbar).toHaveBeenCalledOnce();
    expect(mockedGlobalState.selectedTool).toBe(StylingTools.GeoIndications);
  });

  it('keeps current step when already in styling', () => {
    mockedGlobalState.selectedStep = ToolbarStep.Styling;

    activateStylingToolFromMap(StylingTools.Legend);

    expect(setNavigationState).not.toHaveBeenCalled();
    expect(mockedGlobalState.selectedTool).toBe(StylingTools.Legend);
  });
});
