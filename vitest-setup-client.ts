import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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

vi.mock('$lib/features/commons/services/duckdb-orchestrator.service', () => ({
  duckDBOrchestrator: {
    initialize: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock(
  '$lib/features/commons/services/data-orchestrator.service.svelte',
  () => ({
    dataOrchestrator: {
      initialize: vi.fn().mockResolvedValue(undefined),
      processData: vi.fn().mockResolvedValue(null)
    }
  })
);
