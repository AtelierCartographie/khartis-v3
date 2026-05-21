import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publicEnv: {
    PUBLIC_POSTHOG_KEY: 'phc_test_key_abc',
    PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com'
  },
  posthogInit: vi.fn(),
  posthogCaptureException: vi.fn(),
  posthogRegister: vi.fn()
}));

vi.mock('$env/dynamic/public', () => ({
  env: mocks.publicEnv
}));

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => {
      mocks.posthogInit(...args);
      const args1 = args[1] as
        | { loaded?: (instance: unknown) => void }
        | undefined;
      args1?.loaded?.({ register: mocks.posthogRegister });
    },
    captureException: (...args: unknown[]) =>
      mocks.posthogCaptureException(...args)
  }
}));

type PostHogServiceModule = typeof import('./posthog.service');

async function loadPostHogService(): Promise<PostHogServiceModule> {
  vi.resetModules();
  const module = await import('./posthog.service');
  await module.posthogService.init();
  return module;
}

describe('posthogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = 'phc_test_key_abc';
    mocks.publicEnv.PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
    vi.stubEnv('MODE', 'production');
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('is not configured when PUBLIC_POSTHOG_KEY is empty', async () => {
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = '';
    vi.resetModules();
    const { posthogService } = await import('./posthog.service');

    expect(posthogService.isConfigured()).toBe(false);
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });

  it('is disabled in dev mode even when a key is set', async () => {
    vi.stubEnv('MODE', 'development');
    vi.resetModules();
    const { posthogService } = await import('./posthog.service');
    await posthogService.init();

    expect(posthogService.isConfigured()).toBe(false);
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });

  it('initializes PostHog immediately with full analytics and no PII masking', async () => {
    await loadPostHogService();

    expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
    expect(mocks.posthogInit).toHaveBeenCalledWith(
      'phc_test_key_abc',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        capture_exceptions: true,
        autocapture: true,
        capture_pageview: 'history_change',
        capture_pageleave: true,
        capture_dead_clicks: true,
        capture_performance: true,
        enable_heatmaps: true,
        disable_session_recording: false,
        enable_recording_console_log: true,
        person_profiles: 'always',
        opt_out_capturing_by_default: false,
        respect_dnt: false,
        session_recording: expect.objectContaining({
          maskAllInputs: false,
          recordCrossOriginIframes: false,
          collectFonts: true,
          recordHeaders: true,
          recordBody: true
        })
      })
    );
    const sessionRecording = (
      mocks.posthogInit.mock.calls[0][1] as {
        session_recording: { blockSelector: string };
      }
    ).session_recording;
    expect(sessionRecording.blockSelector).toContain('.deck-canvas');
    expect(sessionRecording.blockSelector).toContain('.maplibregl-canvas');
  });

  it('registers app_version + deploy_env super properties on load', async () => {
    await loadPostHogService();

    expect(mocks.posthogRegister).toHaveBeenCalledTimes(1);
    expect(mocks.posthogRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        deploy_env: 'staging',
        app_version: expect.any(String)
      })
    );
  });

  it('captures exceptions with rich context tags', async () => {
    const { posthogService } = await loadPostHogService();

    const error = new Error('boom');
    posthogService.captureException(error, {
      feature: 'data',
      flow: 'import_file',
      extra: { fileName: 'test.csv' }
    });

    expect(mocks.posthogCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        feature: 'data',
        flow: 'import_file',
        extra: { fileName: 'test.csv' }
      })
    );
  });

  it('drops captureException calls when key is missing', async () => {
    mocks.publicEnv.PUBLIC_POSTHOG_KEY = '';
    vi.resetModules();
    const { posthogService } = await import('./posthog.service');

    posthogService.captureException(new Error('boom'));

    expect(mocks.posthogCaptureException).not.toHaveBeenCalled();
  });

  it('buildFileErrorContext keeps file name and basic metadata only', async () => {
    const { buildFileErrorContext } = await loadPostHogService();

    const fakeFile = {
      id: 'file-1',
      name: 'naissances-2018.csv',
      size: 4096,
      type: 'text/csv',
      status: 'imported',
      sourceType: 'upload',
      duckdbTableName: 'tbl_naissances',
      joinedBasemap: 'communes_fr'
    } as unknown as Parameters<typeof buildFileErrorContext>[0];

    const context = buildFileErrorContext(fakeFile, { isFatal: true });

    expect(context).toMatchObject({
      fileId: 'file-1',
      fileName: 'naissances-2018.csv',
      fileSize: 4096,
      fileType: 'text/csv',
      fileExtension: 'csv',
      duckdbTableName: 'tbl_naissances',
      joinedBasemap: 'communes_fr',
      isFatal: true
    });
    expect('content' in context).toBe(false);
    expect('parsedData' in context).toBe(false);
  });

  it('buildFileErrorContext returns only overrides when file is null', async () => {
    const { buildFileErrorContext } = await loadPostHogService();

    const context = buildFileErrorContext(null, { isFatal: false });

    expect(context).toEqual({ isFatal: false });
  });

  it('forwards logger.error calls to PostHog via the registered sink', async () => {
    await loadPostHogService();
    const { logger, LogCategory } =
      await import('$lib/features/commons/utils/logger');

    logger.error(
      'Pipeline blew up',
      LogCategory.DUCKDB,
      new Error('sql fail'),
      {
        feature: 'data',
        flow: 'classification_calculate_breaks'
      }
    );

    expect(mocks.posthogCaptureException).toHaveBeenCalledTimes(1);
    const [errorArg, propsArg] = mocks.posthogCaptureException.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(propsArg).toMatchObject({
      category: 'DUCKDB',
      feature: 'data',
      flow: 'classification_calculate_breaks'
    });
  });
});
