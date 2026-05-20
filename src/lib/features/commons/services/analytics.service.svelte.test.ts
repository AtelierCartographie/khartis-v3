import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publicEnv: {
    PUBLIC_GA_MEASUREMENT_ID: 'G-TEST123',
    PUBLIC_POSTHOG_KEY: '',
    PUBLIC_POSTHOG_HOST: '',
    PUBLIC_POSTHOG_SESSION_REPLAY: ''
  },
  loggerWarnMock: vi.fn(),
  posthog: {
    init: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    stopSessionRecording: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn()
  }
}));

vi.mock('$env/dynamic/public', () => ({
  env: mocks.publicEnv
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    UI: 'UI'
  },
  logger: {
    warn: (...args: unknown[]) => mocks.loggerWarnMock(...args)
  }
}));

vi.mock('posthog-js', () => ({
  default: mocks.posthog
}));

type AnalyticsServiceModule = typeof import('./analytics.service');

const loadedServices: AnalyticsServiceModule['analyticsService'][] = [];

async function loadAnalyticsService() {
  vi.resetModules();
  const module = await import('./analytics.service');
  loadedServices.push(module.analyticsService);
  return module;
}

async function flushPromises() {
  await vi.dynamicImportSettled();
  await Promise.resolve();
  await Promise.resolve();
}

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = '';
    mocks.publicEnv.PUBLIC_POSTHOG_HOST = '';
    mocks.publicEnv.PUBLIC_POSTHOG_SESSION_REPLAY = '';
    document.head.innerHTML = '';
    document.title = 'Khartis test';
    delete window.dataLayer;
    delete window.gtag;
  });

  afterEach(() => {
    for (const analyticsService of loadedServices.splice(0)) {
      analyticsService.disable();
    }
  });

  it('loads Google Analytics and tracks an initial page view when enabled', async () => {
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(true);

    const script = document.querySelector<HTMLScriptElement>(
      '#khartis-google-analytics'
    );
    expect(script?.src).toContain('https://www.googletagmanager.com/gtag/js');
    expect(script?.src).toContain('G-TEST123');
    expect(window.dataLayer).toEqual(
      expect.arrayContaining([
        [
          'consent',
          'default',
          expect.objectContaining({
            analytics_storage: 'denied'
          })
        ],
        ['config', 'G-TEST123', { send_page_view: false }],
        [
          'consent',
          'update',
          expect.objectContaining({
            analytics_storage: 'granted'
          })
        ],
        [
          'event',
          'page_view',
          expect.objectContaining({
            page_title: 'Khartis test'
          })
        ]
      ])
    );
    expect(mocks.posthog.init).not.toHaveBeenCalled();
  });

  it('does not load analytics without a configured provider', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(false);

    expect(document.querySelector('#khartis-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.loggerWarnMock).toHaveBeenCalledOnce();
  });

  it('tracks custom events only after analytics is enabled', async () => {
    const { analyticsService } = await loadAnalyticsService();

    analyticsService.trackEvent('ignored_event');
    expect(window.dataLayer).toBeUndefined();

    analyticsService.enable();
    analyticsService.trackEvent('tool_opened', { tool: 'layers' });

    expect(window.dataLayer).toContainEqual([
      'event',
      'tool_opened',
      { tool: 'layers' }
    ]);
  });

  it('loads PostHog and tracks a page view after consent', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = 'phc_test';
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(true);
    await flushPromises();

    expect(document.querySelector('#khartis-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(mocks.posthog.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        disable_external_dependency_loading: true,
        disable_session_recording: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
        capture_exceptions: false,
        person_profiles: 'identified_only'
      })
    );
    expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledOnce();
    expect(mocks.posthog.capture).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({
        page_title: 'Khartis test'
      })
    );
  });

  it('enables PostHog session replay only through the explicit environment flag', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = 'phc_test';
    mocks.publicEnv.PUBLIC_POSTHOG_SESSION_REPLAY = 'true';
    const { analyticsService } = await loadAnalyticsService();

    analyticsService.enable();
    await flushPromises();

    expect(mocks.posthog.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        disable_session_recording: false
      })
    );
  });

  it('tracks custom events through PostHog without Google Analytics', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = 'phc_test';
    const { analyticsService } = await loadAnalyticsService();

    analyticsService.trackEvent('ignored_event');
    await flushPromises();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();

    analyticsService.enable();
    await flushPromises();
    mocks.posthog.capture.mockClear();

    analyticsService.trackEvent('tool_opened', { tool: 'layers' });

    expect(mocks.posthog.capture).toHaveBeenCalledWith('tool_opened', {
      tool: 'layers'
    });
  });

  it('captures client errors through PostHog after consent and stops after disable', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = 'phc_test';
    const { analyticsService } = await loadAnalyticsService();

    analyticsService.enable();
    await flushPromises();

    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Client failure' })
    );

    expect(mocks.posthog.captureException).toHaveBeenCalledWith(
      'Client failure',
      {
        source: 'window_error'
      }
    );

    analyticsService.disable();
    expect(mocks.posthog.opt_out_capturing).toHaveBeenCalledOnce();
    expect(mocks.posthog.stopSessionRecording).toHaveBeenCalledOnce();
    mocks.posthog.captureException.mockClear();

    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Client failure' })
    );

    expect(mocks.posthog.captureException).not.toHaveBeenCalled();
  });
});
