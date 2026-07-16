import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import AppLoader from './app-loader.svelte';

const mocks = vi.hoisted(() => ({
  buildFallbackUrl: vi.fn(() => '/?restoreFallback=project-1'),
  currentProject: { id: 'project-1' } as { id: string } | undefined
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    }
  }
}));

vi.mock('$lib/features/commons/utils/pwa-reset', () => ({
  buildLastProjectRestoreFallbackUrl: mocks.buildFallbackUrl
}));

describe('AppLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.currentProject = { id: 'project-1' };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('offers a safe restore escape when loading remains blocked', async () => {
    const replacePage = vi.fn();

    render(AppLoader, { replacePage });

    expect(
      screen.queryByRole('button', { name: m.app_loader_skip_restore() })
    ).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(15_000);
    await tick();

    const escapeButton = screen.getByRole('button', {
      name: m.app_loader_skip_restore()
    });
    await fireEvent.click(escapeButton);

    expect(mocks.buildFallbackUrl).toHaveBeenCalledWith(
      window.location.href,
      'project-1'
    );
    expect(replacePage).toHaveBeenCalledWith('/?restoreFallback=project-1');
  });
});
