import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchTimeoutError, fetchWithTimeout } from './fetch-with-timeout';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
  it('should return the consumed body when the response completes in time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ready', { status: 200 }))
    );

    await expect(
      fetchWithTimeout(
        'https://example.test/data.csv',
        (response) => response.text(),
        100
      )
    ).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should reject when response headers never arrive', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );

    const request = fetchWithTimeout(
      'https://example.test/data.csv',
      (response) => response.text(),
      100
    );
    const rejection = expect(request).rejects.toBeInstanceOf(FetchTimeoutError);

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });

  it('should abort and reject when a successful response body never completes', async () => {
    vi.useFakeTimers();
    const observed: { signal: AbortSignal | null } = { signal: null };

    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        observed.signal = init?.signal ?? null;
        return Promise.resolve(
          new Response(new ReadableStream({ start: () => undefined }), {
            status: 200
          })
        );
      })
    );

    const request = fetchWithTimeout(
      'https://example.test/data.csv',
      (response) => response.text(),
      100
    );
    const rejection = expect(request).rejects.toBeInstanceOf(FetchTimeoutError);

    await vi.advanceTimersByTimeAsync(100);
    await rejection;

    expect(observed.signal?.aborted).toBe(true);
  });
});
