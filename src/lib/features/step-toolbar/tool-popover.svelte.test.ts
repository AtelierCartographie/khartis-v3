import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  selectedTool: 'search' as string | undefined
}));

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalState: mockState
}));

vi.mock('$lib/features/commons/utils/click-outside', () => ({
  clickOutside: () => ({ destroy: () => {} })
}));

vi.mock('carbon-components-svelte', () => ({
  Popover: undefined
}));

import ToolPopover from './tool-popover.svelte';

afterEach(() => {
  cleanup();
  mockState.selectedTool = 'search';
});

describe('ToolPopover — Escape key', () => {
  it('closes the popover (clears selectedTool) when Escape is pressed while open', async () => {
    mockState.selectedTool = 'search';
    render(ToolPopover, { props: { open: true, content: undefined } });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(mockState.selectedTool).toBeUndefined();
  });

  it('does not close the popover when Escape is pressed while closed', async () => {
    mockState.selectedTool = 'search';
    render(ToolPopover, { props: { open: false, content: undefined } });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(mockState.selectedTool).toBe('search');
  });

  it('does not close the popover on other key presses', async () => {
    mockState.selectedTool = 'search';
    render(ToolPopover, { props: { open: true, content: undefined } });

    await fireEvent.keyDown(window, { key: 'Enter' });
    await fireEvent.keyDown(window, { key: 'Tab' });
    await fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(mockState.selectedTool).toBe('search');
  });
});
