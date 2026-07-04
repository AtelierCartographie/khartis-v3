import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StylingTools,
  VisualizationTools
} from '$lib/features/commons/types/global';

const mocks = vi.hoisted(() => ({
  globalState: {
    selectedTool: undefined as unknown
  },
  globalActions: {
    setSelectedTool: vi.fn(),
    resetPagePan: vi.fn()
  }
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalState: mocks.globalState,
  globalActions: mocks.globalActions
}));

import { closeSelectedToolPanel, selectTool } from './tool-list.utils.svelte';

describe('tool list selection utils', () => {
  beforeEach(() => {
    mocks.globalState.selectedTool = undefined;
    mocks.globalActions.setSelectedTool.mockImplementation((tool) => {
      mocks.globalState.selectedTool = tool;
    });
    mocks.globalActions.setSelectedTool.mockClear();
    mocks.globalActions.resetPagePan.mockClear();
  });

  it('resets the page pan when closing a styling tool panel', () => {
    mocks.globalState.selectedTool = StylingTools.Legend;

    closeSelectedToolPanel();

    expect(mocks.globalState.selectedTool).toBeUndefined();
    expect(mocks.globalActions.resetPagePan).toHaveBeenCalledOnce();
  });

  it('does not reset the page pan when closing a visualization tool panel', () => {
    mocks.globalState.selectedTool = VisualizationTools.Layers;

    closeSelectedToolPanel();

    expect(mocks.globalState.selectedTool).toBeUndefined();
    expect(mocks.globalActions.resetPagePan).not.toHaveBeenCalled();
  });

  it('resets the page pan when a selected styling tool is toggled off', () => {
    mocks.globalState.selectedTool = StylingTools.GeoIndications;

    selectTool(StylingTools.GeoIndications);

    expect(mocks.globalState.selectedTool).toBeUndefined();
    expect(mocks.globalActions.resetPagePan).toHaveBeenCalledOnce();
  });

  it('resets the page pan when the close button clears the selected styling tool', () => {
    mocks.globalState.selectedTool = StylingTools.Annotations;

    selectTool(undefined);

    expect(mocks.globalState.selectedTool).toBeUndefined();
    expect(mocks.globalActions.resetPagePan).toHaveBeenCalledOnce();
  });

  it('resets the page pan when switching away from a styling tool', () => {
    mocks.globalState.selectedTool = StylingTools.Legend;

    selectTool(StylingTools.Annotations);

    expect(mocks.globalState.selectedTool).toBe(StylingTools.Annotations);
    expect(mocks.globalActions.resetPagePan).toHaveBeenCalledOnce();
  });

  it('keeps the page pan when switching away from a visualization tool', () => {
    mocks.globalState.selectedTool = VisualizationTools.Layers;

    selectTool(VisualizationTools.Search);

    expect(mocks.globalState.selectedTool).toBe(VisualizationTools.Search);
    expect(mocks.globalActions.resetPagePan).not.toHaveBeenCalled();
  });
});
