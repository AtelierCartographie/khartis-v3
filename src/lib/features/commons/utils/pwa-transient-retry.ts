export const TRANSIENT_HTTP_STATUS_CODES = new Set([
  408, 425, 500, 502, 503, 504
]);

export interface TransientRetryOptions {
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  jitterMs?: number;
  maxRetries?: number;
  random?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}

export async function retryTransientResponse(
  request: Request,
  response: Response,
  options: TransientRetryOptions = {}
): Promise<Response> {
  if (!TRANSIENT_HTTP_STATUS_CODES.has(response.status)) {
    return response;
  }

  const baseDelayMs = options.baseDelayMs ?? 500;
  const fetchImpl = options.fetchImpl ?? fetch;
  const jitterMs = options.jitterMs ?? 500;
  const maxRetries = options.maxRetries ?? 2;
  const random = options.random ?? Math.random;
  const wait =
    options.wait ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let latestResponse = response;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const delayMs = baseDelayMs * Math.pow(2, attempt) + random() * jitterMs;
    await wait(delayMs);

    try {
      const retriedResponse = await fetchImpl(request.clone());
      if (
        retriedResponse.ok ||
        !TRANSIENT_HTTP_STATUS_CODES.has(retriedResponse.status)
      ) {
        return retriedResponse;
      }
      latestResponse = retriedResponse;
    } catch {
      break;
    }
  }

  throw new Error(
    `Transient HTTP ${latestResponse.status} persisted after ${maxRetries} retries`
  );
}
