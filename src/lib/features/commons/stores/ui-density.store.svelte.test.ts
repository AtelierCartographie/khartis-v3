import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGlobalState = vi.hoisted(() => ({ isMobileView: false }));

vi.mock('./global.svelte', () => ({ globalState: mockGlobalState }));

async function loadStore() {
  vi.resetModules();
  return import('./ui-density.store.svelte');
}

describe('uiDensityStore', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.density;
    mockGlobalState.isMobileView = false;
  });

  it('defaults to comfortable and marks the document', async () => {
    const { uiDensityStore, UI_DENSITY } = await loadStore();

    expect(uiDensityStore.density).toBe(UI_DENSITY.COMFORTABLE);
    expect(document.documentElement.dataset.density).toBe('comfortable');
  });

  it('restores the device preference on load', async () => {
    localStorage.setItem('khartis_ui_density', 'compact');

    const { uiDensityStore } = await loadStore();

    expect(uiDensityStore.isCompact).toBe(true);
    expect(document.documentElement.dataset.density).toBe('compact');
  });

  it('persists and applies a change without reload', async () => {
    const { uiDensityStore, UI_DENSITY } = await loadStore();

    uiDensityStore.setDensity(UI_DENSITY.COMPACT);

    expect(localStorage.getItem('khartis_ui_density')).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');
  });

  it('falls back to comfortable on mobile while keeping the preference', async () => {
    localStorage.setItem('khartis_ui_density', 'compact');
    mockGlobalState.isMobileView = true;

    const { uiDensityStore, UI_DENSITY } = await loadStore();

    expect(uiDensityStore.density).toBe(UI_DENSITY.COMPACT);
    expect(uiDensityStore.appliedDensity).toBe(UI_DENSITY.COMFORTABLE);
  });
});
