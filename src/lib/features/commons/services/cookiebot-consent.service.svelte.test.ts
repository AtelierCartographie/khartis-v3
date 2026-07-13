import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerWarnMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    UI: 'UI'
  },
  logger: {
    warn: (...args: unknown[]) => mocks.loggerWarnMock(...args)
  }
}));

import {
  openCookiebotSettings,
  subscribeToCookiebotConsent
} from './cookiebot-consent.service';

describe('Cookiebot consent service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.Cookiebot;
  });

  it('should report consent changes from Cookiebot events', () => {
    const onConsentChange = vi.fn();
    const unsubscribe = subscribeToCookiebotConsent(onConsentChange);

    expect(onConsentChange).toHaveBeenLastCalledWith(false);

    window.Cookiebot = {
      consent: { statistics: true },
      renew: vi.fn()
    };
    window.dispatchEvent(new Event('CookiebotOnConsentReady'));
    expect(onConsentChange).toHaveBeenLastCalledWith(true);

    window.Cookiebot.consent.statistics = false;
    window.dispatchEvent(new Event('CookiebotOnDecline'));
    expect(onConsentChange).toHaveBeenLastCalledWith(false);

    unsubscribe();
    window.Cookiebot.consent.statistics = true;
    window.dispatchEvent(new Event('CookiebotOnAccept'));
    expect(onConsentChange).toHaveBeenCalledTimes(3);
  });

  it('should open Cookiebot settings when the API is available', () => {
    const renew = vi.fn();
    window.Cookiebot = {
      consent: { statistics: false },
      renew
    };

    expect(openCookiebotSettings()).toBe(true);
    expect(renew).toHaveBeenCalledOnce();
  });

  it('should fail safely when Cookiebot is unavailable', () => {
    expect(openCookiebotSettings()).toBe(false);
    expect(mocks.loggerWarnMock).toHaveBeenCalledOnce();
  });
});
