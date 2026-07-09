import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publicEnv: {
    PUBLIC_GA_MEASUREMENT_ID: 'G-TEST123'
  },
  loggerWarnMock: vi.fn()
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

type AnalyticsServiceModule = typeof import('./analytics.service');

const loadedServices: AnalyticsServiceModule['analyticsService'][] = [];

function getGtagCommands(): unknown[][] {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry));
}

function finishGoogleAnalyticsLoading(): void {
  document
    .querySelector<HTMLScriptElement>('#khartis-google-analytics')
    ?.dispatchEvent(new Event('load'));
}

async function loadAnalyticsService() {
  vi.resetModules();
  const module = await import('./analytics.service');
  loadedServices.push(module.analyticsService);
  return module;
}

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    document.head.innerHTML = '';
    document.title = 'Khartis test';
    window.history.replaceState({}, '', '/workspace?shared=private');
    delete window.dataLayer;
    delete window.gtag;
  });

  afterEach(() => {
    for (const analyticsService of loadedServices.splice(0)) {
      analyticsService.disable();
    }
  });

  it('should load Google Analytics and track safe initial events when enabled', async () => {
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(true);

    const script = document.querySelector<HTMLScriptElement>(
      '#khartis-google-analytics'
    );
    expect(script?.src).toContain('https://www.googletagmanager.com/gtag/js');
    expect(script?.src).toContain('G-TEST123');
    finishGoogleAnalyticsLoading();
    expect(getGtagCommands()).toEqual(
      expect.arrayContaining([
        [
          'consent',
          'default',
          expect.objectContaining({
            analytics_storage: 'denied'
          })
        ],
        ['js', expect.any(Date)],
        ['set', 'page_location', `${window.location.origin}/workspace`],
        ['set', 'page_referrer', ''],
        [
          'config',
          'G-TEST123',
          {
            page_location: `${window.location.origin}/workspace`,
            page_referrer: '',
            send_page_view: false
          }
        ],
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
            page_location: `${window.location.origin}/workspace`,
            page_path: '/workspace',
            page_referrer: '',
            page_title: 'Khartis test'
          })
        ],
        ['event', 'app_opened', {}]
      ])
    );
    expect(JSON.stringify(window.dataLayer)).not.toContain('shared=private');

    const queuedMessages = JSON.stringify(window.dataLayer);
    expect(queuedMessages.indexOf('"default"')).toBeLessThan(
      queuedMessages.indexOf('"config"')
    );
    expect(queuedMessages.indexOf('"config"')).toBeLessThan(
      queuedMessages.indexOf('"update"')
    );
    expect(queuedMessages.indexOf('"update"')).toBeLessThan(
      queuedMessages.indexOf('"page_view"')
    );
  });

  it('should not load analytics when no provider is configured', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(false);

    expect(document.querySelector('#khartis-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(mocks.loggerWarnMock).toHaveBeenCalledOnce();
  });

  it('should track allow-listed event parameters only after analytics is enabled', async () => {
    const { analyticsService, ANALYTICS_EVENT } = await loadAnalyticsService();

    analyticsService.trackProjectCreated([
      { sourceType: 'file_upload', fileType: 'csv' }
    ]);
    expect(window.dataLayer).toBeUndefined();

    analyticsService.enable();
    analyticsService.trackProjectCreated([
      { sourceType: 'file_upload', fileType: 'csv' }
    ]);
    expect(getGtagCommands()).not.toContainEqual([
      'event',
      'project_created',
      expect.anything()
    ]);
    finishGoogleAnalyticsLoading();
    analyticsService.trackEvent(ANALYTICS_EVENT.PROJECT_CREATED, {
      file_count: 1,
      file_name: 'private-data.csv'
    });
    analyticsService.trackVisualizationCreated('choropleth');

    expect(getGtagCommands()).toContainEqual([
      'event',
      'project_created',
      { file_count: 1 }
    ]);
    expect(getGtagCommands()).toContainEqual([
      'event',
      'visualization_created',
      { visualization_type: 'choropleth' }
    ]);
    expect(JSON.stringify(window.dataLayer)).not.toContain('private-data.csv');
  });

  it('should track sanitized failures and remove error listeners when analytics is disabled', async () => {
    const { analyticsService } = await loadAnalyticsService();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    analyticsService.enable();
    finishGoogleAnalyticsLoading();
    analyticsService.trackFailure(
      'window_error',
      new TypeError('private file name'),
      true
    );

    expect(getGtagCommands()).toContainEqual([
      'event',
      'app_error',
      {
        error_source: 'window_error',
        error_type: 'TypeError',
        fatal: true
      }
    ]);
    expect(JSON.stringify(window.dataLayer)).not.toContain('private file name');
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    );

    analyticsService.disable();
    const dataLayerLength = window.dataLayer?.length;
    analyticsService.trackFailure(
      'window_error',
      new TypeError('private file name'),
      true
    );

    expect(window.dataLayer).toHaveLength(dataLayerLength ?? 0);
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    );
  });

  it('should update consent to denied and clear Google Analytics cookies when disabled', async () => {
    const { analyticsService } = await loadAnalyticsService();

    document.cookie = '_ga=analytics-cookie; Path=/';
    document.cookie = '_gid=session-cookie; Path=/';
    document.cookie = 'khartis_locale=fr; Path=/';

    analyticsService.enable();
    finishGoogleAnalyticsLoading();
    analyticsService.disable();

    expect(getGtagCommands()).toContainEqual([
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'denied'
      })
    ]);
    expect(document.cookie).not.toContain('_ga=');
    expect(document.cookie).not.toContain('_gid=');
    expect(document.cookie).toContain('khartis_locale=fr');
  });
});
