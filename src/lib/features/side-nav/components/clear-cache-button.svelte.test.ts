import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: 'idle',
  runFullUpdateFlowMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/features/commons/services/pwa-update.service.svelte', () => ({
  pwaUpdateService: {
    get status() {
      return mocks.status;
    },
    runFullUpdateFlow: (...args: unknown[]) =>
      mocks.runFullUpdateFlowMock(...args)
  }
}));

describe('ClearCacheButton', () => {
  beforeEach(() => {
    mocks.status = 'idle';
  });

  it('should check for an update when the sidebar action is clicked', async () => {
    const Component = (await import('./clear-cache-button.svelte')).default;
    render(Component);

    expect(screen.getByText('Rechercher une mise à jour')).toBeTruthy();

    await fireEvent.click(screen.getByTestId('sidenav-update-button'));

    expect(mocks.runFullUpdateFlowMock).toHaveBeenCalledOnce();
  });

  it('should expose the available update action', async () => {
    mocks.status = 'available';
    const Component = (await import('./clear-cache-button.svelte')).default;
    render(Component);

    expect(screen.getByText('Mettre à jour et redémarrer')).toBeTruthy();
  });

  it('should show the refreshing state while the runtime is cleared', async () => {
    mocks.status = 'refreshing';
    const Component = (await import('./clear-cache-button.svelte')).default;
    render(Component);

    expect(screen.getByText("Actualisation de l'application…")).toBeTruthy();
    const button = screen
      .getByTestId('sidenav-update-button')
      .closest('button');
    expect(button?.disabled).toBe(true);
  });
});
