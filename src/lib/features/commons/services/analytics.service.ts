import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

type ConsentValue = 'granted' | 'denied';

type GtagParams = Record<string, string | number | boolean | undefined>;

type GtagArgs =
  | ['js', Date]
  | ['config', string, GtagParams?]
  | ['event', string, GtagParams?]
  | ['consent', 'default' | 'update', Record<string, ConsentValue>];

type GtagFunction = (...args: GtagArgs) => void;

declare global {
  interface Window {
    dataLayer?: GtagArgs[];
    gtag?: GtagFunction;
  }
}

const GOOGLE_TAG_SCRIPT_ID = 'khartis-google-analytics';

function getMeasurementId(): string {
  return env.PUBLIC_GA_MEASUREMENT_ID?.trim() ?? '';
}

function getDataLayer(): GtagArgs[] {
  window.dataLayer ??= [];
  return window.dataLayer;
}

function gtag(...args: GtagArgs): void {
  getDataLayer().push(args);
}

function getConsentState(analyticsStorage: ConsentValue) {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: analyticsStorage
  } satisfies Record<string, ConsentValue>;
}

function createAnalyticsService() {
  let googleInitialized = false;
  let enabled = false;

  function hasMeasurementId(): boolean {
    return getMeasurementId().length > 0;
  }

  function hasConfiguredProvider(): boolean {
    return hasMeasurementId();
  }

  function loadScript(measurementId: string): void {
    if (document.getElementById(GOOGLE_TAG_SCRIPT_ID)) {
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_TAG_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  function initializeGoogleAnalytics(): boolean {
    if (!browser || !hasMeasurementId()) {
      return false;
    }

    if (googleInitialized) {
      return true;
    }

    const measurementId = getMeasurementId();
    window.gtag = gtag;
    gtag('consent', 'default', getConsentState('denied'));
    loadScript(measurementId);
    gtag('js', new Date());
    gtag('config', measurementId, { send_page_view: false });

    googleInitialized = true;
    return true;
  }

  function getPageViewProperties(): GtagParams {
    return {
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
      page_title: document.title
    };
  }

  function trackPageView(): void {
    if (!browser || !enabled) {
      return;
    }

    if (hasMeasurementId() && window.gtag) {
      window.gtag('event', 'page_view', getPageViewProperties());
    }
  }

  function enable(): boolean {
    if (!hasConfiguredProvider()) {
      logger.warn(
        'Analytics consent accepted but no analytics provider is configured',
        LogCategory.UI
      );
      return false;
    }

    enabled = true;
    if (initializeGoogleAnalytics()) {
      window.gtag?.('consent', 'update', getConsentState('granted'));
      trackPageView();
    }
    return true;
  }

  function disable(): void {
    enabled = false;

    if (!browser || !window.gtag) {
      return;
    }

    window.gtag('consent', 'update', getConsentState('denied'));
  }

  function trackEvent(eventName: string, params: GtagParams = {}): void {
    if (!browser || !enabled) {
      return;
    }

    if (hasMeasurementId() && window.gtag) {
      window.gtag('event', eventName, params);
    }
  }

  return {
    enable,
    disable,
    trackPageView,
    trackEvent
  };
}

export const analyticsService = createAnalyticsService();
