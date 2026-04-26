import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyticsEnableMock: vi.fn(),
  analyticsDisableMock: vi.fn(),
  analyticsTrackEventMock: vi.fn(),
  loggerErrorMock: vi.fn()
}));

vi.mock('$lib/features/commons/services/analytics.service', () => ({
  analyticsService: {
    enable: (...args: unknown[]) => mocks.analyticsEnableMock(...args),
    disable: (...args: unknown[]) => mocks.analyticsDisableMock(...args),
    trackEvent: (...args: unknown[]) => mocks.analyticsTrackEventMock(...args)
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    STORE: 'STORE'
  },
  logger: {
    error: (...args: unknown[]) => mocks.loggerErrorMock(...args)
  }
}));

async function loadConsentStore() {
  vi.resetModules();
  return import('./consent.store.svelte');
}

describe('consentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('enables analytics after accepting consent', async () => {
    const { consentStore } = await loadConsentStore();

    consentStore.acceptAll();

    expect(consentStore.hasConsented).toBe(true);
    expect(consentStore.analyticsAllowed).toBe(true);
    expect(mocks.analyticsEnableMock).toHaveBeenCalledOnce();
    expect(mocks.analyticsTrackEventMock).toHaveBeenCalledWith(
      'analytics_consent_accept'
    );
  });

  it('disables analytics after declining consent', async () => {
    const { consentStore } = await loadConsentStore();

    consentStore.declineAll();

    expect(consentStore.hasConsented).toBe(true);
    expect(consentStore.analyticsAllowed).toBe(false);
    expect(mocks.analyticsDisableMock).toHaveBeenCalledOnce();
  });

  it('restores analytics when a valid stored consent allows it', async () => {
    localStorage.setItem(
      'khartis_consent',
      JSON.stringify({
        analytics: true,
        consentDate: '2026-04-26T00:00:00.000Z',
        consentVersion: 1
      })
    );

    await loadConsentStore();

    expect(mocks.analyticsEnableMock).toHaveBeenCalledOnce();
  });
});
