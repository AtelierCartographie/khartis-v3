import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { PostHog, PostHogConfig, Properties } from 'posthog-js';

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
const POSTHOG_DEFAULT_HOST = 'https://eu.i.posthog.com';
const POSTHOG_DEFAULTS = '2026-01-30';

function getMeasurementId(): string {
  return env.PUBLIC_GA_MEASUREMENT_ID?.trim() ?? '';
}

function getPostHogKey(): string {
  return env.PUBLIC_POSTHOG_KEY?.trim() ?? '';
}

function getPostHogHost(): string {
  return env.PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST;
}

function isPostHogSessionReplayEnabled(): boolean {
  return env.PUBLIC_POSTHOG_SESSION_REPLAY?.trim().toLowerCase() === 'true';
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
  let postHogClient: PostHog | null = null;
  let postHogLoadPromise: Promise<PostHog | null> | null = null;
  let enabled = false;
  let errorListenersAttached = false;

  function hasMeasurementId(): boolean {
    return getMeasurementId().length > 0;
  }

  function hasPostHogKey(): boolean {
    return getPostHogKey().length > 0;
  }

  function hasConfiguredProvider(): boolean {
    return hasMeasurementId() || hasPostHogKey();
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

  function toPostHogProperties(params: GtagParams = {}): Properties {
    const properties: Properties = {};

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        properties[key] = value;
      }
    }

    return properties;
  }

  function getPageViewProperties(): GtagParams {
    return {
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
      page_title: document.title
    };
  }

  function capturePostHogPageView(client: PostHog): void {
    client.capture('$pageview', toPostHogProperties(getPageViewProperties()));
  }

  function capturePostHogException(
    error: unknown,
    params: GtagParams = {}
  ): void {
    if (!browser || !enabled || !hasPostHogKey()) {
      return;
    }

    const properties = toPostHogProperties(params);
    if (postHogClient) {
      postHogClient.captureException(error, properties);
      return;
    }

    void initializePostHog().then((client) => {
      client?.captureException(error, properties);
    });
  }

  function handleWindowError(event: ErrorEvent): void {
    capturePostHogException(event.error ?? event.message, {
      source: 'window_error'
    });
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    capturePostHogException(event.reason, {
      source: 'unhandled_rejection'
    });
  }

  function attachPostHogErrorListeners(): void {
    if (!browser || errorListenersAttached) {
      return;
    }

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    errorListenersAttached = true;
  }

  function detachPostHogErrorListeners(): void {
    if (!browser || !errorListenersAttached) {
      return;
    }

    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    errorListenersAttached = false;
  }

  function initializePostHog(): Promise<PostHog | null> {
    if (!browser || !hasPostHogKey()) {
      return Promise.resolve(null);
    }

    if (postHogClient) {
      return Promise.resolve(postHogClient);
    }

    if (postHogLoadPromise) {
      return postHogLoadPromise;
    }

    postHogLoadPromise = import('posthog-js')
      .then(({ default: posthog }) => {
        const sessionReplayEnabled = isPostHogSessionReplayEnabled();
        const config = {
          api_host: getPostHogHost(),
          defaults: POSTHOG_DEFAULTS,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_dead_clicks: false,
          disable_external_dependency_loading: true,
          disable_session_recording: !sessionReplayEnabled,
          enable_recording_console_log: false,
          mask_all_text: true,
          mask_all_element_attributes: true,
          opt_out_capturing_by_default: true,
          opt_out_persistence_by_default: true,
          capture_exceptions: false,
          person_profiles: 'identified_only',
          persistence: 'localStorage'
        } satisfies Partial<PostHogConfig>;

        posthog.init(getPostHogKey(), config);
        posthog.opt_in_capturing();
        postHogClient = posthog;
        attachPostHogErrorListeners();
        capturePostHogPageView(posthog);

        return posthog;
      })
      .catch((error: unknown) => {
        logger.warn(
          'PostHog analytics initialization failed',
          LogCategory.UI,
          error
        );
        postHogLoadPromise = null;
        return null;
      });

    return postHogLoadPromise;
  }

  function trackPageView(): void {
    if (!browser || !enabled) {
      return;
    }

    const pageViewProperties = getPageViewProperties();

    if (hasMeasurementId() && window.gtag) {
      window.gtag('event', 'page_view', pageViewProperties);
    }

    if (postHogClient) {
      capturePostHogPageView(postHogClient);
      return;
    }

    if (hasPostHogKey()) {
      void initializePostHog().then((client) => {
        if (client) {
          capturePostHogPageView(client);
        }
      });
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
    if (hasPostHogKey()) {
      void initializePostHog();
    }
    return true;
  }

  function disable(): void {
    enabled = false;
    detachPostHogErrorListeners();
    postHogClient?.opt_out_capturing();
    postHogClient?.stopSessionRecording();

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

    if (postHogClient) {
      postHogClient.capture(eventName, toPostHogProperties(params));
      return;
    }

    if (hasPostHogKey()) {
      void initializePostHog().then((client) => {
        client?.capture(eventName, toPostHogProperties(params));
      });
    }
  }

  return {
    enable,
    disable,
    captureException: capturePostHogException,
    trackPageView,
    trackEvent
  };
}

export const analyticsService = createAnalyticsService();
