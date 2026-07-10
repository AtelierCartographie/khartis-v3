import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consentState: {
    hasConsented: false,
    analyticsAllowed: false
  },
  acceptAllMock: vi.fn(),
  declineAllMock: vi.fn()
}));

vi.mock('$lib/features/commons/stores/consent.store.svelte', () => ({
  consentStore: {
    get hasConsented() {
      return mocks.consentState.hasConsented;
    },
    get analyticsAllowed() {
      return mocks.consentState.analyticsAllowed;
    },
    acceptAll: (...args: unknown[]) => mocks.acceptAllMock(...args),
    declineAll: (...args: unknown[]) => mocks.declineAllMock(...args)
  }
}));

describe('DataPrivacyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consentState.hasConsented = false;
    mocks.consentState.analyticsAllowed = false;
  });

  it('should expose the analytics consent switch from the main menu cookie entry', async () => {
    const Component = (await import('./data-privacy-modal.svelte')).default;
    render(Component);

    expect(
      screen.getByRole('button', {
        name: 'Gérer les cookies'
      })
    ).toBeTruthy();

    await fireEvent.click(screen.getByTestId('sidenav-cookie-consent'));

    expect(screen.getByText('Cookies Google Analytics')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('should accept analytics consent when the switch is turned on', async () => {
    const Component = (await import('./data-privacy-modal.svelte')).default;
    render(Component);

    await fireEvent.click(screen.getByTestId('sidenav-cookie-consent'));
    await fireEvent.change(screen.getByRole('switch'), {
      target: { checked: true }
    });

    await waitFor(() => {
      expect(mocks.acceptAllMock).toHaveBeenCalledOnce();
    });
    expect(mocks.declineAllMock).not.toHaveBeenCalled();
  });

  it('should decline analytics consent when the switch is turned off', async () => {
    mocks.consentState.hasConsented = true;
    mocks.consentState.analyticsAllowed = true;

    const Component = (await import('./data-privacy-modal.svelte')).default;
    render(Component);

    await fireEvent.click(screen.getByTestId('sidenav-cookie-consent'));
    await fireEvent.change(screen.getByRole('switch'), {
      target: { checked: false }
    });

    await waitFor(() => {
      expect(mocks.declineAllMock).toHaveBeenCalledOnce();
    });
    expect(mocks.acceptAllMock).not.toHaveBeenCalled();
  });
});
