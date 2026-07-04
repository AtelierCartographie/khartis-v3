import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';

export const DATASET_READY_RETRY_DELAY_MS = 200;
export const DATASET_READY_MAX_RETRIES = 15;

export interface WaitForDatasetAvailabilityOptions {
  abortSignal?: AbortSignal;
  isCancelled?: () => boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

function isCancelled(options: WaitForDatasetAvailabilityOptions): boolean {
  return Boolean(options.abortSignal?.aborted || options.isCancelled?.());
}

async function waitForNextAttempt(
  retryDelayMs: number,
  abortSignal?: AbortSignal
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort);
      resolve();
    }, retryDelayMs);

    const onAbort = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForDatasetAvailability(
  datasetId: string,
  options: WaitForDatasetAvailabilityOptions = {}
): Promise<boolean> {
  const maxRetries = options.maxRetries ?? DATASET_READY_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DATASET_READY_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (isCancelled(options)) {
      return false;
    }

    const dataset =
      duckDBOrchestrator.getDataset(datasetId) ||
      duckDBOrchestrator.getDatasetBySourceFile(datasetId);
    if (dataset) {
      return true;
    }

    if (attempt === maxRetries) {
      return false;
    }

    await waitForNextAttempt(retryDelayMs, options.abortSignal);
  }

  return false;
}
