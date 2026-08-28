import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  globalActions: {
    setNavigationState: vi.fn(),
    setSelectedTool: vi.fn(),
    setToolbarState: vi.fn(),
    closeMobileToolbar: vi.fn(),
    resetPagePan: vi.fn(),
    zoomInPage: vi.fn(),
    zoomOutPage: vi.fn(),
    resetPageZoom: vi.fn()
  },
  globalState: {
    isCreateProjectModalOpen: false,
    isMobileToolbarOpen: false,
    toolbarState: 'full',
    selectedStep: 'data',
    selectedTool: undefined as string | undefined,
    isSideNavOpen: false,
    isDuplicateModalOpen: false,
    isDeleteModalOpen: false
  },
  mapInstanceStore: {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn()
  },
  zoomModeStore: {
    isMapMode: false,
    toggle: vi.fn()
  },
  createProjectActions: {
    resetAllTabs: vi.fn(),
    selectTab: vi.fn()
  },
  projectStore: {
    currentProject: undefined,
    saveCurrentProject: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn()
  }
}));

vi.mock('../stores/global.svelte', () => ({
  globalActions: mocks.globalActions,
  globalState: mocks.globalState
}));

vi.mock('../stores/map-instance.store.svelte', () => ({
  mapInstanceStore: mocks.mapInstanceStore
}));

vi.mock('../stores/zoom-mode.store.svelte', () => ({
  zoomModeStore: mocks.zoomModeStore
}));

vi.mock('../stores/create-project.store.svelte', () => ({
  createProjectActions: mocks.createProjectActions
}));

vi.mock('../stores/project.store.svelte', () => ({
  projectStore: mocks.projectStore
}));

import KeyboardShortcuts from './keyboard-shortcuts.svelte';

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.globalState.isCreateProjectModalOpen = false;
    mocks.globalState.isMobileToolbarOpen = false;
    mocks.globalState.toolbarState = 'full';
    mocks.globalState.selectedStep = 'data';
    mocks.globalState.selectedTool = undefined;
    mocks.globalState.isSideNavOpen = false;
    mocks.globalState.isDuplicateModalOpen = false;
    mocks.globalState.isDeleteModalOpen = false;
    mocks.zoomModeStore.isMapMode = false;
    mocks.globalActions.setSelectedTool.mockImplementation((tool) => {
      mocks.globalState.selectedTool = tool;
    });
  });

  it('ignores navigation shortcuts from native selects', async () => {
    render(KeyboardShortcuts);
    const select = document.createElement('select');
    document.body.append(select);

    await fireEvent.keyDown(select, { key: '2', code: 'Digit2' });

    expect(mocks.globalActions.setNavigationState).not.toHaveBeenCalled();
    select.remove();
  });

  it('keeps navigation shortcuts active outside form fields', async () => {
    render(KeyboardShortcuts);

    await fireEvent.keyDown(document.body, { key: '2', code: 'Digit2' });

    expect(mocks.globalActions.setNavigationState).toHaveBeenCalledWith(
      'visualizations'
    );
  });

  it('closes the side navigation before collapsing the workspace', async () => {
    render(KeyboardShortcuts);
    mocks.globalState.isSideNavOpen = true;

    await fireEvent.keyDown(document.body, {
      key: 'Escape',
      code: 'Escape'
    });

    expect(mocks.globalState.isSideNavOpen).toBe(false);
    expect(mocks.globalActions.setToolbarState).not.toHaveBeenCalled();
  });

  it('closes the side navigation when a focused control consumes Escape', async () => {
    render(KeyboardShortcuts);
    mocks.globalState.isSideNavOpen = true;
    const input = document.createElement('input');
    input.addEventListener('keydown', (event) => event.stopPropagation());
    document.body.append(input);
    input.focus();

    await fireEvent.keyDown(input, {
      key: 'Escape',
      code: 'Escape'
    });

    expect(mocks.globalState.isSideNavOpen).toBe(false);
    expect(mocks.globalActions.setToolbarState).not.toHaveBeenCalled();
    input.remove();
  });

  it('closes the mobile toolbar before collapsing the workspace', async () => {
    render(KeyboardShortcuts);
    mocks.globalState.isMobileToolbarOpen = true;
    mocks.globalActions.closeMobileToolbar.mockImplementation(() => {
      mocks.globalState.isMobileToolbarOpen = false;
    });

    await fireEvent.keyDown(document.body, {
      key: 'Escape',
      code: 'Escape'
    });

    expect(mocks.globalActions.closeMobileToolbar).toHaveBeenCalledOnce();
    expect(mocks.globalState.isMobileToolbarOpen).toBe(false);
    expect(mocks.globalActions.setToolbarState).not.toHaveBeenCalled();
  });

  it('closes the selected styling tool before collapsing the workspace', async () => {
    render(KeyboardShortcuts);
    mocks.globalState.selectedTool = 'format';

    await fireEvent.keyDown(document.body, {
      key: 'Escape',
      code: 'Escape'
    });

    expect(mocks.globalActions.setSelectedTool).toHaveBeenCalledWith(undefined);
    expect(mocks.globalActions.resetPagePan).toHaveBeenCalledOnce();
    expect(mocks.globalActions.setToolbarState).not.toHaveBeenCalled();
  });

  it('leaves the workspace unchanged while a modal handles Escape', async () => {
    render(KeyboardShortcuts);
    const modal = document.createElement('div');
    modal.className = 'bx--modal is-visible';
    document.body.append(modal);

    await fireEvent.keyDown(document.body, {
      key: 'Escape',
      code: 'Escape'
    });

    expect(mocks.globalActions.setToolbarState).not.toHaveBeenCalled();
    expect(mocks.globalActions.closeMobileToolbar).not.toHaveBeenCalled();
    modal.remove();
  });
});
