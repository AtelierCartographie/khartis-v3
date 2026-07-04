import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { ToolbarState, ToolbarStep } from '$lib/features/commons/types/global';
import { globalState } from '$lib/features/commons/stores/global.svelte';
import PalettePopover from './palette-popover.svelte';
import { PALETTE_TYPE } from './palette.constants';

const mocks = vi.hoisted(() => {
  class OffscreenCanvasMock {
    constructor(
      readonly width: number,
      readonly height: number
    ) {}

    getContext() {
      return {
        fillStyle: '#000000',
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray([0, 0, 0, 255])
        }))
      };
    }
  }

  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock);

  return {
    registerMock: vi.fn(),
    notifyChangeMock: vi.fn(),
    datasetsStoreMock: {
      datasets: [] as Array<{ id: string; sourceFileId: string }>,
      selectedDataset: undefined as
        { id: string; sourceFileId: string } | undefined,
      getDatasetBySourceFile: vi.fn(),
      waitForDatasetBySourceFile: vi.fn(),
      selectDataset: vi.fn(),
      syncMapVisibilityWithSourceFile: vi.fn()
    },
    projectStoreMock: {
      currentProject: undefined as
        | { data?: { sourceFiles?: Array<{ id: string; name: string }> } }
        | undefined
    }
  };
});

vi.mock('$lib/features/project-management/core', () => ({
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: mocks.datasetsStoreMock
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: mocks.projectStoreMock
}));

describe('PalettePopover', () => {
  beforeEach(() => {
    mocks.notifyChangeMock.mockClear();
    globalState.selectedStep = ToolbarStep.Data;
    globalState.toolbarState = ToolbarState.Full;
  });

  afterEach(() => {
    cleanup();
  });

  it('preserves the draft when toolbar width changes while open', async () => {
    const onvalidate = vi.fn();

    render(PalettePopover, {
      open: true,
      currentColors: ['#111111', '#222222'],
      currentInverted: false,
      selectedPaletteId: 'blues',
      paletteType: PALETTE_TYPE.SEQUENTIAL,
      numClasses: 2,
      onvalidate
    });

    const invertSwitch = await screen.findByRole('switch', {
      name: m.invert_palette_tooltip()
    });

    await fireEvent.change(invertSwitch, { target: { checked: true } });
    expect(invertSwitch).toBeChecked();

    globalState.toolbarState = ToolbarState.Compact;
    await tick();

    await fireEvent.click(
      screen.getByRole('button', { name: m.button_validate() })
    );

    expect(onvalidate).toHaveBeenCalledTimes(1);
    expect(onvalidate.mock.calls[0][2]).toBe(true);
  });
});
