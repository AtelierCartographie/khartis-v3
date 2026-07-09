import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

type ConsentValue = 'granted' | 'denied';

type GtagParams = Record<string, string | number | boolean | undefined>;
type AnalyticsEventName =
  (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];
type AnalyticsFailureSource =
  | 'data_import'
  | 'export'
  | 'project_create'
  | 'project_import'
  | 'project_open'
  | 'unhandled_rejection'
  | 'window_error';
type AnalyticsProjectOpenSource = 'backup_file' | 'local_storage';
type AnalyticsExportTarget = 'data' | 'map' | 'project';

interface AnalyticsTrackableFile {
  fileType: string;
  sourceType: string;
}

interface PendingAnalyticsEvent {
  eventName: AnalyticsEventName;
  params: GtagParams;
}

type GtagArgs =
  | ['config', string, GtagParams?]
  | ['event', AnalyticsEventName, GtagParams?]
  | ['js', Date]
  | ['set', 'page_location' | 'page_referrer', string]
  | ['consent', 'default' | 'update', Record<string, ConsentValue>];

type DataLayerEntry = IArguments;
type GtagFunction = (...args: GtagArgs) => void;

declare global {
  interface Window {
    dataLayer?: DataLayerEntry[];
    gtag?: GtagFunction;
  }
}

const GOOGLE_ANALYTICS_SCRIPT_ID = 'khartis-google-analytics';
const SCIENCES_PO_GA_MEASUREMENT_ID = 'G-QRN3HTM8ZX';
const SCIENCES_PO_HOSTNAME = 'www.sciencespo.fr';
const SCIENCES_PO_PRODUCTION_PATH = '/cartographie/khartisnewprod';
const GOOGLE_ANALYTICS_COOKIE_NAMES = new Set(['_ga', '_gid', '_gat']);
const GOOGLE_ANALYTICS_COOKIE_PREFIXES = ['_ga_', '_gat_', '_gcl_'];
const MAX_TRACKED_FILE_COUNT = 10;
const TRACKED_DATA_SOURCE_TYPES = [
  'file_upload',
  'paste',
  'url',
  'copy'
] as const;
const TRACKED_FILE_TYPES = [
  'csv',
  'tsv',
  'geojson',
  'shapefile',
  'geopackage',
  'geoparquet',
  'arrow',
  'kml',
  'kmz',
  'gpx',
  'zip',
  'unknown'
] as const;
const TRACKED_VISUALIZATION_TYPES = [
  'choropleth',
  'proportional',
  'categorical',
  'bivariate'
] as const;
const TRACKED_EXPORT_FORMATS = [
  'csv',
  'geojson',
  'geopackage',
  'jpg',
  'kh',
  'svg'
] as const;
const TRACKED_EXPORT_RESOLUTIONS = ['1080p', '2k', '4k', 'vector'] as const;
const TRACKED_ERROR_TYPES = [
  'AbortError',
  'DataValidationError',
  'Error',
  'ExportError',
  'NetworkError',
  'NotSupportedError',
  'ParseError',
  'PipelineError',
  'RangeError',
  'SecurityError',
  'SyntaxError',
  'TypeError',
  'UnknownError'
] as const;

export const ANALYTICS_EVENT = {
  ANALYTICS_CONSENT_ACCEPT: 'analytics_consent_accept',
  APP_ERROR: 'app_error',
  APP_OPENED: 'app_opened',
  DATA_IMPORT_COMPLETED: 'data_import_completed',
  EXPORT_COMPLETED: 'export_completed',
  PAGE_VIEW: 'page_view',
  PROJECT_CREATED: 'project_created',
  PROJECT_OPENED: 'project_opened',
  VISUALIZATION_CREATED: 'visualization_created'
} as const;

const ANALYTICS_EVENT_PARAMETERS = {
  [ANALYTICS_EVENT.ANALYTICS_CONSENT_ACCEPT]: [],
  [ANALYTICS_EVENT.APP_ERROR]: ['error_source', 'error_type', 'fatal'],
  [ANALYTICS_EVENT.APP_OPENED]: [],
  [ANALYTICS_EVENT.DATA_IMPORT_COMPLETED]: [
    'source_type',
    'file_type',
    'file_count'
  ],
  [ANALYTICS_EVENT.EXPORT_COMPLETED]: [
    'export_target',
    'export_format',
    'export_resolution'
  ],
  [ANALYTICS_EVENT.PAGE_VIEW]: [
    'page_location',
    'page_path',
    'page_referrer',
    'page_title'
  ],
  [ANALYTICS_EVENT.PROJECT_CREATED]: ['source_type', 'file_type', 'file_count'],
  [ANALYTICS_EVENT.PROJECT_OPENED]: ['open_source'],
  [ANALYTICS_EVENT.VISUALIZATION_CREATED]: ['visualization_type']
} as const satisfies Record<AnalyticsEventName, readonly string[]>;

function isOfficialKhartisProductionUrl(): boolean {
  if (!browser) return false;

  return (
    window.location.hostname === SCIENCES_PO_HOSTNAME &&
    window.location.pathname.startsWith(SCIENCES_PO_PRODUCTION_PATH)
  );
}

function getMeasurementId(): string {
  const configuredMeasurementId = env.PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (configuredMeasurementId) {
    return configuredMeasurementId;
  }

  return isOfficialKhartisProductionUrl() ? SCIENCES_PO_GA_MEASUREMENT_ID : '';
}

function getDataLayer(): DataLayerEntry[] {
  window.dataLayer ??= [];
  return window.dataLayer;
}

function gtag(..._args: GtagArgs): void {
  // gtag.js recognizes commands from the arguments object.
  // eslint-disable-next-line prefer-rest-params
  getDataLayer().push(arguments);
}

function getConsentState(analyticsStorage: ConsentValue) {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: analyticsStorage
  } satisfies Record<string, ConsentValue>;
}

function getAllowedTrackingValue(
  value: string,
  allowedValues: readonly string[]
): string {
  return allowedValues.includes(value) ? value : 'unknown';
}

function getSingleTrackingValue(
  values: readonly string[],
  allowedValues: readonly string[]
): string {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length !== 1) {
    return uniqueValues.length === 0 ? 'unknown' : 'multiple';
  }

  return getAllowedTrackingValue(uniqueValues[0], allowedValues);
}

function getFileTrackingProperties(
  files: readonly AnalyticsTrackableFile[]
): GtagParams {
  return {
    source_type: getSingleTrackingValue(
      files.map((file) => file.sourceType),
      TRACKED_DATA_SOURCE_TYPES
    ),
    file_type: getSingleTrackingValue(
      files.map((file) => file.fileType),
      TRACKED_FILE_TYPES
    ),
    file_count: Math.min(files.length, MAX_TRACKED_FILE_COUNT)
  };
}

function getSafeErrorType(error: unknown): string {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  return getAllowedTrackingValue(errorName, TRACKED_ERROR_TYPES);
}

function getSafePageLocation(): string {
  const url = new URL(window.location.href);
  return `${url.origin}${url.pathname}`;
}

function getSafePageReferrer(): string {
  if (!document.referrer) {
    return '';
  }

  const url = new URL(document.referrer);
  return `${url.origin}${url.pathname}`;
}

function isGoogleAnalyticsCookieName(cookieName: string): boolean {
  return (
    GOOGLE_ANALYTICS_COOKIE_NAMES.has(cookieName) ||
    GOOGLE_ANALYTICS_COOKIE_PREFIXES.some((prefix) =>
      cookieName.startsWith(prefix)
    )
  );
}

function getCookieDeletionDomains(hostname: string): string[] {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return [''];
  }

  const domains = new Set<string>(['']);
  const parts = hostname.split('.').filter(Boolean);
  for (let index = 0; index <= parts.length - 2; index += 1) {
    const domain = parts.slice(index).join('.');
    domains.add(domain);
    domains.add(`.${domain}`);
  }
  return [...domains];
}

function deleteCookie(cookieName: string, domain: string): void {
  const domainAttribute = domain ? `; Domain=${domain}` : '';
  document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax${domainAttribute}`;
}

function clearGoogleAnalyticsCookies(): void {
  const cookieNames = document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0])
    .filter(isGoogleAnalyticsCookieName);

  for (const cookieName of cookieNames) {
    for (const domain of getCookieDeletionDomains(window.location.hostname)) {
      deleteCookie(cookieName, domain);
    }
  }
}

function createAnalyticsService() {
  let googleAnalyticsInitialized = false;
  let googleAnalyticsReady = false;
  let enabled = false;
  let globalErrorTrackingInstalled = false;
  let pendingAnalyticsEvents: PendingAnalyticsEvent[] = [];

  function hasMeasurementId(): boolean {
    return getMeasurementId().length > 0;
  }

  function hasConfiguredProvider(): boolean {
    return hasMeasurementId();
  }

  function loadScript(measurementId: string, onLoad: () => void): void {
    const existingElement = document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID);
    if (existingElement instanceof HTMLScriptElement) {
      const existingScript = existingElement;
      if (existingScript.dataset.loaded === 'true') {
        onLoad();
      } else {
        existingScript.addEventListener('load', onLoad, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.onload = () => {
      script.dataset.loaded = 'true';
      onLoad();
    };
    document.head.appendChild(script);
  }

  function initializeGoogleAnalytics(): boolean {
    if (!browser || !hasMeasurementId()) {
      return false;
    }

    if (googleAnalyticsInitialized) {
      return true;
    }

    const measurementId = getMeasurementId();
    window.gtag = gtag;
    gtag('consent', 'default', getConsentState('denied'));
    gtag('set', 'page_location', getSafePageLocation());
    gtag('set', 'page_referrer', getSafePageReferrer());
    loadScript(measurementId, () => {
      googleAnalyticsReady = true;
      if (enabled) {
        trackInitialEvents();
      }
    });
    gtag('js', new Date());
    gtag('config', measurementId, {
      page_location: getSafePageLocation(),
      page_referrer: getSafePageReferrer(),
      send_page_view: false
    });
    window.gtag('consent', 'update', getConsentState('granted'));

    googleAnalyticsInitialized = true;
    return true;
  }

  function getPageViewProperties(): GtagParams {
    return {
      page_location: getSafePageLocation(),
      page_path: window.location.pathname,
      page_referrer: getSafePageReferrer(),
      page_title: document.title
    };
  }

  function getAllowedEventParameters(
    eventName: AnalyticsEventName,
    params: GtagParams
  ): GtagParams {
    const allowedParams: GtagParams = {};

    for (const parameterName of ANALYTICS_EVENT_PARAMETERS[eventName]) {
      const value = params[parameterName];
      if (value !== undefined) {
        allowedParams[parameterName] = value;
      }
    }

    return allowedParams;
  }

  function sendEvent(eventName: AnalyticsEventName, params: GtagParams): void {
    window.gtag?.('event', eventName, params);
  }

  function flushPendingEvents(): void {
    const queuedEvents = pendingAnalyticsEvents;
    pendingAnalyticsEvents = [];

    for (const event of queuedEvents) {
      sendEvent(event.eventName, event.params);
    }
  }

  function trackInitialEvents(): void {
    if (!enabled || !googleAnalyticsReady) {
      return;
    }

    trackPageView();
    trackEvent(ANALYTICS_EVENT.APP_OPENED);
    flushPendingEvents();
  }

  function trackPageView(): void {
    if (!browser || !enabled) {
      return;
    }

    if (hasMeasurementId()) {
      trackEvent('page_view', getPageViewProperties());
    }
  }

  function trackProjectCreated(files: readonly AnalyticsTrackableFile[]): void {
    trackEvent(
      ANALYTICS_EVENT.PROJECT_CREATED,
      getFileTrackingProperties(files)
    );
  }

  function trackProjectOpened(source: AnalyticsProjectOpenSource): void {
    trackEvent(ANALYTICS_EVENT.PROJECT_OPENED, { open_source: source });
  }

  function trackDataImportCompleted(
    files: readonly AnalyticsTrackableFile[]
  ): void {
    trackEvent(
      ANALYTICS_EVENT.DATA_IMPORT_COMPLETED,
      getFileTrackingProperties(files)
    );
  }

  function trackVisualizationCreated(type: string): void {
    trackEvent(ANALYTICS_EVENT.VISUALIZATION_CREATED, {
      visualization_type: getAllowedTrackingValue(
        type,
        TRACKED_VISUALIZATION_TYPES
      )
    });
  }

  function trackExportCompleted(
    target: AnalyticsExportTarget,
    format: string,
    resolution?: string
  ): void {
    trackEvent(ANALYTICS_EVENT.EXPORT_COMPLETED, {
      export_target: target,
      export_format: getAllowedTrackingValue(format, TRACKED_EXPORT_FORMATS),
      export_resolution: resolution
        ? getAllowedTrackingValue(resolution, TRACKED_EXPORT_RESOLUTIONS)
        : undefined
    });
  }

  function trackFailure(
    source: AnalyticsFailureSource,
    error: unknown,
    fatal = false
  ): void {
    trackEvent(ANALYTICS_EVENT.APP_ERROR, {
      error_source: source,
      error_type: getSafeErrorType(error),
      fatal
    });
  }

  function handleWindowError(event: ErrorEvent): void {
    trackFailure('window_error', event.error, true);
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    trackFailure('unhandled_rejection', event.reason, true);
  }

  function installGlobalErrorTracking(): void {
    if (globalErrorTrackingInstalled) {
      return;
    }

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    globalErrorTrackingInstalled = true;
  }

  function removeGlobalErrorTracking(): void {
    if (!globalErrorTrackingInstalled) {
      return;
    }

    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    globalErrorTrackingInstalled = false;
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
      installGlobalErrorTracking();
      trackInitialEvents();
    }
    return true;
  }

  function disable(): void {
    enabled = false;
    pendingAnalyticsEvents = [];

    if (!browser) {
      return;
    }

    removeGlobalErrorTracking();
    window.gtag?.('consent', 'update', getConsentState('denied'));
    clearGoogleAnalyticsCookies();
  }

  function trackEvent(
    eventName: AnalyticsEventName,
    params: GtagParams = {}
  ): void {
    if (!browser || !enabled) {
      return;
    }

    if (hasMeasurementId()) {
      const allowedParams = getAllowedEventParameters(eventName, params);
      if (!googleAnalyticsReady) {
        pendingAnalyticsEvents.push({ eventName, params: allowedParams });
        return;
      }

      sendEvent(eventName, allowedParams);
    }
  }

  return {
    enable,
    disable,
    trackPageView,
    trackEvent,
    trackProjectCreated,
    trackProjectOpened,
    trackDataImportCompleted,
    trackVisualizationCreated,
    trackExportCompleted,
    trackFailure
  };
}

export const analyticsService = createAnalyticsService();
