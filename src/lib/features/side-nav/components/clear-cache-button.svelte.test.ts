import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  factoryResetPwaMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/features/commons/utils/pwa-reset', () => ({
  factoryResetPwa: (...args: unknown[]) => mocks.factoryResetPwaMock(...args)
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { SYSTEM: 'SYSTEM' },
  logger: {
    error: vi.fn()
  }
}));

describe('ClearCacheButton', () => {
  it('shows the update copy and runs the PWA factory reset on confirmation', async () => {
    const Component = (await import('./clear-cache-button.svelte')).default;
    render(Component);

    await fireEvent.click(screen.getByTestId('sidenav-clear-cache-button'));

    expect(screen.getByText('Actualiser Khartis ?')).toBeTruthy();
    expect(
      screen.getByText(
        'Khartis va nettoyer son moteur puis recharger la page. Vos projets sauvegardés restent conservés et se rouvrent depuis le menu.'
      )
    ).toBeTruthy();

    await fireEvent.click(screen.getByText('Actualiser'));

    await waitFor(() => {
      expect(mocks.factoryResetPwaMock).toHaveBeenCalledWith({ reload: true });
    });
  });
});
