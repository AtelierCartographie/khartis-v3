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

  it('should expose analytics consent actions from the main menu privacy entry', async () => {
    const Component = (await import('./data-privacy-modal.svelte')).default;
    render(Component);

    expect(
      screen.getByRole('button', {
        name: 'Gérer les cookies'
      })
    ).toBeTruthy();

    await fireEvent.click(screen.getByTestId('sidenav-cookie-consent'));

    expect(screen.getByText('Aucun choix enregistré')).toBeTruthy();
    expect(screen.getByText('Cookies Google Analytics')).toBeTruthy();

    await fireEvent.click(
      screen.getByRole('button', {
        name: "Autoriser la mesure d'audience"
      })
    );
    await fireEvent.click(
      screen.getByRole('button', {
        name: "Refuser la mesure d'audience"
      })
    );

    await waitFor(() => {
      expect(mocks.acceptAllMock).toHaveBeenCalledOnce();
      expect(mocks.declineAllMock).toHaveBeenCalledOnce();
    });
  });
});
