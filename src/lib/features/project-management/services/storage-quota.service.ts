import { PipelineError } from '$lib/features/commons/pipeline.errors';
import { m } from '$lib/paraglide/messages';

export const PROJECT_STORAGE_QUOTA_ERROR_CODE =
  'PROJECT_STORAGE_QUOTA_EXCEEDED';

export interface BrowserStorageStatus {
  usage: number;
  quota: number;
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    cause?: unknown;
    code?: unknown;
    name?: unknown;
  };

  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate.code === 22 ||
    candidate.code === 1014 ||
    candidate.code === PROJECT_STORAGE_QUOTA_ERROR_CODE ||
    isQuotaExceededError(candidate.cause)
  );
}

/**
 * Turns a browser quota failure into the error the user can act on, and
 * returns any other error unchanged.
 */
export function toStorageQuotaError(
  error: unknown,
  details: Record<string, unknown> = {}
): unknown {
  if (
    error instanceof PipelineError &&
    error.code === PROJECT_STORAGE_QUOTA_ERROR_CODE
  ) {
    return error;
  }

  if (!isQuotaExceededError(error)) {
    return error;
  }

  return new PipelineError(
    m.error_storage_quota_exceeded(),
    PROJECT_STORAGE_QUOTA_ERROR_CODE,
    { ...details, cause: error }
  );
}

export async function readBrowserStorageStatus(): Promise<BrowserStorageStatus | null> {
  const storageManager = globalThis.navigator?.storage;
  if (!storageManager?.estimate) {
    return null;
  }

  try {
    const { usage = 0, quota = 0 } = await storageManager.estimate();
    if (!quota) {
      return null;
    }

    return { usage, quota };
  } catch {
    return null;
  }
}
