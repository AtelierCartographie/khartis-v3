import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openCookiebotSettingsMock: vi.fn()
}));

vi.mock('$lib/features/commons/services/cookiebot-consent.service', () => ({
  openCookiebotSettings: (...args: unknown[]) =>
    mocks.openCookiebotSettingsMock(...args)
}));

describe('DataPrivacyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should open Cookiebot settings from the main menu cookie entry', async () => {
    const Component = (await import('./data-privacy-modal.svelte')).default;
    render(Component);

    expect(
      screen.getByRole('button', {
        name: 'Gérer les cookies'
      })
    ).toBeTruthy();

    await fireEvent.click(screen.getByTestId('sidenav-cookie-consent'));

    expect(mocks.openCookiebotSettingsMock).toHaveBeenCalledOnce();
  });
});
