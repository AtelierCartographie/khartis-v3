import { afterEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { FETCH_TIMEOUT_MS } from '$lib/features/commons/utils/fetch-with-timeout';
import { EXAMPLE_PROJECTS, loadExampleData } from './examples.data';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadExampleData', () => {
  it('should reject when a successful example response body never completes', async () => {
    vi.useFakeTimers();
    const example = EXAMPLE_PROJECTS[0];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ start: () => undefined }), {
          status: 200
        })
      )
    );

    const request = loadExampleData(example);
    const rejection = expect(request).rejects.toMatchObject({
      name: 'PipelineError',
      code: 'EXAMPLE_DATA_DOWNLOAD_TIMEOUT',
      message: m.error_download_timeout(),
      details: {
        exampleId: example.id,
        dataUrl: example.dataUrl,
        timeoutMs: FETCH_TIMEOUT_MS
      }
    });

    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await rejection;
  });
});
