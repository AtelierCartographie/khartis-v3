import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

if (typeof globalThis.Worker === 'undefined') {
  class WorkerStub {
    onmessage: ((event: MessageEvent) => void) | null = null;

    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}

    dispatchEvent(): boolean {
      return false;
    }
  }
  vi.stubGlobal('Worker', WorkerStub);
}

// Files run in Node unless they ask for jsdom with `// @vitest-environment jsdom`.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    enumerable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
}

// jsdom has no Web Animations API; Svelte transitions run on it. The stub
// finishes each animation at once.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function animate() {
    const animation = {
      onfinish: null as (() => void) | null,
      finished: Promise.resolve(),
      cancel: () => {},
      finish: () => animation.onfinish?.()
    };
    queueMicrotask(() => animation.onfinish?.());
    return animation as unknown as Animation;
  };
}

vi.mock('$env/dynamic/public', () => ({
  env: {}
}));

vi.mock('$lib/features/duckdb', async () => ({
  ...(await import('$lib/features/duckdb/utils/duckdb-error.utils')),
  duckDBOrchestrator: {
    initialize: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(null)
  },
  Duck: {},
  validateGPSColumns: vi.fn().mockResolvedValue({ isValid: true }),
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  }
}));

vi.mock(
  '$lib/features/commons/services/data-orchestrator.service.svelte',
  () => ({
    dataOrchestratorService: {
      initialize: vi.fn().mockResolvedValue(undefined),
      processData: vi.fn().mockResolvedValue(null)
    }
  })
);
