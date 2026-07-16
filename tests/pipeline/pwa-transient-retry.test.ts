import { describe, expect, it, vi } from 'vitest';
import { retryTransientResponse } from '../../src/lib/features/commons/utils/pwa-transient-retry';

const request = new Request('https://example.org/cartographie/khartis/');

describe('PWA transient HTTP retry', () => {
  it('should throw after transient responses are exhausted so Workbox can use its cache fallback', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Unavailable', { status: 503 }));

    await expect(
      retryTransientResponse(
        request,
        new Response('Unavailable', { status: 503 }),
        {
          fetchImpl,
          maxRetries: 2,
          wait: async () => {}
        }
      )
    ).rejects.toThrow('Transient HTTP 503 persisted');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('should return the first successful retry', async () => {
    const recoveredResponse = new Response('Khartis', { status: 200 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(recoveredResponse);

    await expect(
      retryTransientResponse(
        request,
        new Response('Unavailable', { status: 503 }),
        {
          fetchImpl,
          wait: async () => {}
        }
      )
    ).resolves.toBe(recoveredResponse);
  });

  it('should return non-transient errors without retrying them', async () => {
    const notFoundResponse = new Response('Not found', { status: 404 });
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      retryTransientResponse(request, notFoundResponse, {
        fetchImpl,
        wait: async () => {}
      })
    ).resolves.toBe(notFoundResponse);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
