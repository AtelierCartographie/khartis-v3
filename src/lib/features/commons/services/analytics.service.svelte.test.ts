import { beforeEach, describe, expect, it, vi } from 'vitest';

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

async function loadAnalyticsService() {
  vi.resetModules();
  return import('./analytics.service');
}

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    document.head.innerHTML = '';
    document.title = 'Khartis test';
    delete window.dataLayer;
    delete window.gtag;
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
  });

  it('does not load analytics without a measurement id', async () => {
    mocks.publicEnv.PUBLIC_GA_MEASUREMENT_ID = '';
    const { analyticsService } = await loadAnalyticsService();

    expect(analyticsService.enable()).toBe(false);

    expect(document.querySelector('#khartis-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
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
});
