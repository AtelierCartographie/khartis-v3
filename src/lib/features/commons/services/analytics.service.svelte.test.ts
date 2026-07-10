import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publicEnv: {
    PUBLIC_GTM_CONTAINER_ID: 'GTM-TEST12'
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

function dataLayerEntries(): unknown[] {
  return window.dataLayer ?? [];
}

function isConsentCommand(entry: unknown): entry is ArrayLike<unknown> {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as ArrayLike<unknown>).length === 'number'
  );
}

function consentCommands(): unknown[][] {
  return dataLayerEntries()
    .filter(isConsentCommand)
    .map((entry) => Array.from(entry));
}

function dataLayerObjects(): Record<string, unknown>[] {
  return dataLayerEntries().filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      !isConsentCommand(entry) &&
      'event' in entry
  );
}

function trackedEvents(): Record<string, unknown>[] {
  return dataLayerObjects().filter((entry) => entry.event !== 'gtm.js');
}

function finishTagManagerLoading(): void {
  document
    .querySelector<HTMLScriptElement>('#khartis-google-tag-manager')
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
    mocks.publicEnv.PUBLIC_GTM_CONTAINER_ID = 'GTM-TEST12';
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

  it('should load Google Tag Manager and track safe initial events when enabled', async () => {
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(true);

    const script = document.querySelector<HTMLScriptElement>(
      '#khartis-google-tag-manager'
    );
    expect(script?.src).toContain('https://www.googletagmanager.com/gtm.js');
    expect(script?.src).toContain('GTM-TEST12');

    expect(consentCommands()).toEqual(
      expect.arrayContaining([
        [
          'consent',
          'default',
          expect.objectContaining({ analytics_storage: 'denied' })
        ],
        [
          'consent',
          'update',
          expect.objectContaining({ analytics_storage: 'granted' })
        ]
      ])
    );
    expect(dataLayerObjects()).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: 'gtm.js' })])
    );

    finishTagManagerLoading();

    expect(trackedEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'page_view',
          page_location: `${window.location.origin}/workspace`,
          page_path: '/workspace',
          page_referrer: '',
          page_title: 'Khartis test'
        }),
        expect.objectContaining({ event: 'app_opened' })
      ])
    );
    expect(JSON.stringify(window.dataLayer)).not.toContain('shared=private');

    const serialized = JSON.stringify(window.dataLayer);
    expect(serialized.indexOf('"default"')).toBeLessThan(
      serialized.indexOf('"update"')
    );
    expect(serialized.indexOf('"gtm.start"')).toBeGreaterThan(-1);
  });

  it('should not load analytics when no container is configured', async () => {
    mocks.publicEnv.PUBLIC_GTM_CONTAINER_ID = '';
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(false);

    expect(document.querySelector('#khartis-google-tag-manager')).toBeNull();
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
    finishTagManagerLoading();
    analyticsService.trackEvent(ANALYTICS_EVENT.PROJECT_CREATED, {
      file_count: 1,
      file_name: 'private-data.csv'
    });
    analyticsService.trackVisualizationCreated('choropleth');

    expect(trackedEvents()).toEqual(
      expect.arrayContaining([
        { event: 'project_created', file_count: 1 },
        { event: 'visualization_created', visualization_type: 'choropleth' }
      ])
    );
    expect(JSON.stringify(window.dataLayer)).not.toContain('private-data.csv');
  });

  it('should track sanitized failures and remove error listeners when analytics is disabled', async () => {
    const { analyticsService } = await loadAnalyticsService();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    analyticsService.enable();
    finishTagManagerLoading();
    analyticsService.trackFailure(
      'window_error',
      new TypeError('private file name'),
      true
    );

    expect(trackedEvents()).toEqual(
      expect.arrayContaining([
        {
          event: 'app_error',
          error_source: 'window_error',
          error_type: 'TypeError',
          fatal: true
        }
      ])
    );
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
    finishTagManagerLoading();
    analyticsService.disable();

    expect(consentCommands()).toEqual(
      expect.arrayContaining([
        [
          'consent',
          'update',
          expect.objectContaining({ analytics_storage: 'denied' })
        ]
      ])
    );
    expect(document.cookie).not.toContain('_ga=');
    expect(document.cookie).not.toContain('_gid=');
    expect(document.cookie).toContain('khartis_locale=fr');
  });
});
