export const FETCH_TIMEOUT_MS = 30_000;
export const REMOTE_FILE_FETCH_TIMEOUT_MS = 5 * 60_000;

export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Fetch timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  consumeResponse: (response: Response) => Promise<T>,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const operation = (async () => {
    const response = await fetch(input, { signal: controller.signal });
    return consumeResponse(response);
  })();

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new FetchTimeoutError(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
