import { LogCategory, logger } from '$lib/features/commons/utils/logger';

interface CookiebotConsent {
  statistics: boolean;
}

interface CookiebotApi {
  consent: CookiebotConsent;
  renew: () => void;
}

declare global {
  interface Window {
    Cookiebot?: CookiebotApi;
  }
}

const COOKIEBOT_CONSENT_EVENTS = [
  'CookiebotOnConsentReady',
  'CookiebotOnAccept',
  'CookiebotOnDecline'
] as const;

export function subscribeToCookiebotConsent(
  onConsentChange: (analyticsAllowed: boolean) => void
): () => void {
  function syncConsent(): void {
    onConsentChange(window.Cookiebot?.consent.statistics === true);
  }

  for (const eventName of COOKIEBOT_CONSENT_EVENTS) {
    window.addEventListener(eventName, syncConsent);
  }
  syncConsent();

  return () => {
    for (const eventName of COOKIEBOT_CONSENT_EVENTS) {
      window.removeEventListener(eventName, syncConsent);
    }
  };
}

export function openCookiebotSettings(): boolean {
  if (!window.Cookiebot) {
    logger.warn(
      'Cookiebot settings are unavailable because Cookiebot is not initialized',
      LogCategory.UI
    );
    return false;
  }

  window.Cookiebot.renew();
  return true;
}
