import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'src/lib/features/commons/services/runtime-observability.service.ts',
  'utf8'
);
const hooksSource = readFileSync('src/hooks.client.ts', 'utf8');

describe('runtime observability', () => {
  it('is installed from the SvelteKit client init hook', () => {
    expect(hooksSource).toContain('export const init: ClientInit');
    expect(hooksSource).toContain('installRuntimeObservability();');
  });

  it('captures global failures and main-thread stalls with recent context', () => {
    expect(source).toContain("window.addEventListener('error'");
    expect(source).toContain("window.addEventListener('unhandledrejection'");
    expect(source).toContain('khartis_main_thread_stall');
    expect(source).toContain('khartis_worker_watchdog_stall');
    expect(source).toContain('new Worker(workerUrl');
    expect(source).toContain('Khartis main thread heartbeat missed');
    expect(source).toContain('Worker watchdog persisted main thread stall');
    expect(source).toContain('WORKER_STALL_DB_NAME');
    expect(source).toContain(
      'recentInteractions: recentInteractions.slice(-5)'
    );
  });

  it('observes long tasks and long animation frames for script attribution', () => {
    expect(source).toContain("observePerformanceEntries(\n    'longtask'");
    expect(source).toContain(
      "observePerformanceEntries(\n    'long-animation-frame'"
    );
    expect(source).toContain("readArray(entry, 'scripts')");
    expect(source).toContain(
      "sourceFunctionName: compactString(readString(value, 'sourceFunctionName'))"
    );
  });
});
