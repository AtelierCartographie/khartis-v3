import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaletteDropdown from './palette-dropdown.svelte';
import { PALETTE_TYPE } from './palette.constants';

function createDomRect({
  top,
  left,
  width,
  height
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

describe('PaletteDropdown', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('cancels the pending position frame on destroy', () => {
    const frameId = 123;
    const triggerElement = document.createElement('button');
    vi.spyOn(triggerElement, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ top: 10, left: 20, width: 160, height: 24 })
    );
    const requestFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => frameId);
    const cancelFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    const { unmount } = render(PaletteDropdown, {
      open: true,
      triggerElement,
      selectedPaletteId: 'vif',
      paletteType: PALETTE_TYPE.QUALITATIVE,
      numClasses: 4
    });

    unmount();

    expect(requestFrameSpy).toHaveBeenCalledTimes(1);
    expect(cancelFrameSpy).toHaveBeenCalledWith(frameId);
  });

  it('uses palette display names as accessible option names', () => {
    const triggerElement = document.createElement('button');
    vi.spyOn(triggerElement, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ top: 10, left: 20, width: 160, height: 24 })
    );

    render(PaletteDropdown, {
      open: true,
      triggerElement,
      selectedPaletteId: 'vif',
      paletteType: PALETTE_TYPE.QUALITATIVE,
      numClasses: 4
    });

    expect(screen.getByRole('option', { name: 'Vif' })).toBeInTheDocument();
  });
});
