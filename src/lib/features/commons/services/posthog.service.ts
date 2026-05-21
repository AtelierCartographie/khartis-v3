import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import {
  LogCategory,
  logger,
  registerErrorSink
} from '$lib/features/commons/utils/logger';
import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import type { PostHog } from 'posthog-js';

export interface CaptureExceptionContext {
  category?: LogCategory;
  feature?: string;
  flow?: string;
  tool?: string;
  primitive?: string;
  extra?: Record<string, unknown>;
}

export interface PipelineFileErrorContext {
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileExtension?: string;
  fileStatus?: string;
  fileSourceType?: string;
  datasetId?: string;
  duckdbTableName?: string;
  joinedBasemap?: string;
  errorMessageFromFile?: string;
}

function extractFileExtension(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

export function buildFileErrorContext(
  file: Partial<UploadedFile> | null | undefined,
  overrides: Record<string, unknown> = {}
): PipelineFileErrorContext & Record<string, unknown> {
  if (!file) return { ...overrides };

  return {
    fileId: file.id,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    fileExtension: extractFileExtension(file.name),
    fileStatus: file.status as string | undefined,
    fileSourceType: file.sourceType as string | undefined,
    duckdbTableName: file.duckdbTableName,
    joinedBasemap: file.joinedBasemap,
    errorMessageFromFile: file.errorMessage,
    ...overrides
  };
}

type PostHogModule = typeof import('posthog-js');

interface PostHogServiceConfig {
  apiKey: string;
  apiHost: string;
  appVersion: string;
}

const POSTHOG_DEFAULT_HOST = 'https://eu.i.posthog.com';

function readAppVersion(): string {
  const value = import.meta.env.VITE_APP_VERSION;
  return typeof value === 'string' ? value.trim() : '';
}

function readConfig(): PostHogServiceConfig | null {
  if (import.meta.env.MODE !== 'production') {
    return null;
  }

  const apiKey = env.PUBLIC_POSTHOG_KEY?.trim() ?? '';
  if (!apiKey) {
    return null;
  }

  const rawHost = env.PUBLIC_POSTHOG_HOST?.trim();
  const apiHost =
    rawHost && rawHost.length > 0 ? rawHost : POSTHOG_DEFAULT_HOST;

  return { apiKey, apiHost, appVersion: readAppVersion() };
}

function buildContextTags(context: CaptureExceptionContext) {
  const tags: Record<string, string> = {};
  if (context.category) tags.category = context.category;
  if (context.feature) tags.feature = context.feature;
  if (context.flow) tags.flow = context.flow;
  if (context.tool) tags.tool = context.tool;
  if (context.primitive) tags.primitive = context.primitive;
  return tags;
}

function coerceToError(input: unknown): Error {
  if (input instanceof Error) return input;
  if (typeof input === 'string') return new Error(input);
  try {
    return new Error(JSON.stringify(input));
  } catch {
    return new Error('Unknown error');
  }
}

function createPostHogService() {
  let posthog: PostHog | null = null;
  let initPromise: Promise<PostHog | null> | null = null;

  function isConfigured(): boolean {
    return readConfig() !== null;
  }

  async function init(): Promise<PostHog | null> {
    if (!browser) return null;
    if (posthog) return posthog;
    if (initPromise) return initPromise;

    const config = readConfig();
    if (!config) return null;

    initPromise = (async () => {
      try {
        const module: PostHogModule = await import('posthog-js');
        const instance = module.default;
        instance.init(config.apiKey, {
          api_host: config.apiHost,
          ui_host: 'https://eu.posthog.com',
          defaults: '2026-01-30',

          capture_exceptions: true,

          autocapture: true,
          capture_pageview: 'history_change',
          capture_pageleave: true,
          capture_dead_clicks: true,
          capture_performance: true,
          enable_heatmaps: true,

          disable_session_recording: false,
          enable_recording_console_log: true,
          session_recording: {
            maskAllInputs: false,
            blockSelector: [
              '.deck-canvas',
              '.maplibregl-canvas',
              '.shared-facets-canvas'
            ].join(', '),
            recordCrossOriginIframes: false,
            collectFonts: true,
            recordHeaders: true,
            recordBody: true
          },

          person_profiles: 'always',
          opt_out_capturing_by_default: false,
          respect_dnt: false,

          loaded: (loaded) => {
            loaded.register({
              app_version: config.appVersion || 'unknown',
              deploy_env: 'staging',
              base_path: import.meta.env.BASE_PATH ?? ''
            });
          }
        });
        posthog = instance;
        return instance;
      } catch (error) {
        logger.error('Failed to initialize PostHog', LogCategory.SYSTEM, error);
        return null;
      }
    })();

    return initPromise;
  }

  function captureException(
    error: unknown,
    context: CaptureExceptionContext = {}
  ): void {
    if (!browser) return;
    const config = readConfig();
    if (!config) return;

    const exception = coerceToError(error);
    const tags = buildContextTags(context);
    const properties: Record<string, unknown> = {
      ...tags
    };
    if (context.extra) {
      properties.extra = context.extra;
    }

    const instance = posthog;
    if (!instance) {
      void init().then((ready) => {
        ready?.captureException(exception, properties);
      });
      return;
    }

    instance.captureException(exception, properties);
  }

  function captureEvent(
    eventName: string,
    properties: Record<string, unknown> = {}
  ): void {
    if (!browser) return;
    const config = readConfig();
    if (!config) return;

    const instance = posthog;
    if (!instance) {
      void init().then((ready) => {
        ready?.capture(eventName, properties);
      });
      return;
    }

    instance.capture(eventName, properties);
  }

  return {
    init,
    captureEvent,
    captureException,
    isConfigured
  };
}

export const posthogService = createPostHogService();

if (typeof window !== 'undefined') {
  void posthogService.init();
}

function extractErrorFromData(data: unknown): Error | null {
  if (data instanceof Error) return data;
  if (data && typeof data === 'object') {
    const candidate = (data as Record<string, unknown>).error;
    if (candidate instanceof Error) return candidate;
  }
  return null;
}

function buildExtraFromData(
  message: string,
  data: unknown
): Record<string, unknown> {
  const extra: Record<string, unknown> = { message };
  if (data && typeof data === 'object' && !(data instanceof Error)) {
    extra.data = data;
  }
  return extra;
}

registerErrorSink((message, category, data, context) => {
  const error = extractErrorFromData(data) ?? new Error(message);
  posthogService.captureException(error, {
    category,
    feature: context?.feature,
    flow: context?.flow,
    tool: context?.tool,
    primitive: context?.primitive,
    extra: { ...buildExtraFromData(message, data), ...(context?.extra ?? {}) }
  });
});
